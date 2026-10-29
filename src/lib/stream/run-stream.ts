import { ApiError } from '@/lib/api/client';
import type { RuntimeApi } from '@/lib/api/runtime';
import { TURN_END_EVENTS, type TypedRunEvent } from '@/lib/api/types';
import type { StreamConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import { readSse } from './sse';

export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RunStreamHandlers {
  /** Every new event, in `seq` order, once (repeats after a reconnect are dropped, case U-04). */
  onEvent(event: TypedRunEvent): void;
  onState?(state: StreamState): void;
  /** The first response was accepted: the run started or resumed. */
  onOpen?(): void;
  /** The request was refused, or the stream could not be reopened (`lost`). */
  onError?(error: ApiError, lost: boolean): void;
}

type Opener = (signal: AbortSignal) => Promise<Response>;

/**
 * Failures worth another attempt: no response at all, or a gateway error between the browser and
 * the runtime. A refusal from the runtime itself (`OVERLOADED`, `RATE_LIMITED`) is shown with its
 * Retry instead, so load shedding is not answered with more load.
 */
const transient = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 504);

const asApiError = (error: unknown): ApiError =>
  error instanceof ApiError ? error : new ApiError(0, 'NETWORK_ERROR', t('error.network'), '', true);

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * The stream client of task U5-02: one turn's event stream with reconnects. Events are parsed into
 * typed events and delivered once each by `seq`; a stream that drops or goes quiet longer than
 * `idleTimeoutMs` (heartbeats keep it alive) is reopened with `GET /v1/runs/{id}/events` and
 * `Last-Event-ID`, with exponential backoff. Before the first event the start request itself is
 * repeated under the same `Idempotency-Key`, which replays the same run. A `stream.gap` event is
 * delivered like any other: the caller reloads what the gap lost from the API.
 */
export class RunStream {
  private runIdValue: string | undefined;
  private lastSeqValue = 0;
  private closed = false;
  private turnEnded = false;
  private readonly stop = new AbortController();
  private current: AbortController | undefined;

  constructor(
    private readonly api: RuntimeApi,
    private readonly config: StreamConfig,
    private readonly handlers: RunStreamHandlers,
    known: { runId?: string; lastSeq?: number } = {},
  ) {
    this.runIdValue = known.runId;
    this.lastSeqValue = known.lastSeq ?? 0;
  }

  get runId(): string | undefined {
    return this.runIdValue;
  }

  get lastSeq(): number {
    return this.lastSeqValue;
  }

  /** `POST /v1/runs` in stream mode. */
  start(body: Parameters<RuntimeApi['startRunStream']>[0], idempotencyKey: string): Promise<void> {
    return this.loop((signal) => this.api.startRunStream(body, { signal, idempotencyKey }));
  }

  /** `POST /v1/runs/{id}/interrupts/{interruptId}` in stream mode: the resumed turn. */
  resume(interruptId: string, answer: unknown): Promise<void> {
    const runId = this.requireRunId();
    return this.loop((signal) =>
      this.api.answerInterruptStream(runId, interruptId, { answer, mode: 'stream' }, { signal }),
    );
  }

  /** Follows a run that is already going (a reopened chat): its events after `lastSeq`. */
  attach(): Promise<void> {
    const runId = this.requireRunId();
    return this.loop((signal) => this.api.runEvents(runId, this.lastSeqValue || undefined, signal));
  }

  /** Stops reading; the run itself goes on (Stop cancels it first, see the run store). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stop.abort();
    this.current?.abort();
    this.handlers.onState?.('closed');
  }

  private requireRunId(): string {
    if (!this.runIdValue) throw new Error('the run is not known yet');
    return this.runIdValue;
  }

  private async loop(first: Opener): Promise<void> {
    this.turnEnded = false;
    let open = first;
    let opened = false;
    let attempt = 0;
    this.handlers.onState?.('connecting');
    while (!this.closed) {
      const controller = new AbortController();
      this.current = controller;
      let response: Response | undefined;
      try {
        response = await open(controller.signal);
      } catch (error) {
        if (this.closed) return;
        if (!transient(error)) {
          this.handlers.onError?.(asApiError(error), opened);
          this.finish();
          return;
        }
      }
      if (response) {
        if (!opened) {
          opened = true;
          this.handlers.onOpen?.();
        }
        this.handlers.onState?.('open');
        const before = this.lastSeqValue;
        await this.read(response, controller);
        if (this.lastSeqValue > before) attempt = 0;
      }
      if (this.closed || this.turnEnded) break;
      attempt += 1;
      if (attempt > this.config.reconnectAttempts) {
        this.handlers.onError?.(new ApiError(0, 'STREAM_LOST', t('stream.lost'), '', true), true);
        break;
      }
      this.handlers.onState?.('reconnecting');
      await delay(this.config.reconnectDelayMs * 2 ** (attempt - 1), this.stop.signal);
      // Once the run is known, reopen its event stream after the last event; before that, repeat
      // the request: the same Idempotency-Key replays the same run from its first event.
      if (this.runIdValue) {
        const runId = this.runIdValue;
        open = (signal) => this.api.runEvents(runId, this.lastSeqValue || undefined, signal);
      }
    }
    this.finish();
  }

  private finish(): void {
    this.current = undefined;
    if (!this.closed) this.handlers.onState?.('closed');
  }

  /** Reads one response until the turn ends, the body ends, the stream goes idle or `close()`. */
  private async read(response: Response, controller: AbortController): Promise<void> {
    if (!response.body) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const alive = () => {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), this.config.idleTimeoutMs);
    };
    alive();
    try {
      for await (const frame of readSse(response.body, controller.signal)) {
        alive();
        if (frame.event === 'heartbeat') continue;
        let event: TypedRunEvent;
        try {
          event = JSON.parse(frame.data) as TypedRunEvent;
        } catch {
          continue;
        }
        if (typeof event.seq !== 'number' || event.seq <= this.lastSeqValue) continue;
        this.lastSeqValue = event.seq;
        this.runIdValue ??= event.runId;
        this.handlers.onEvent(event);
        if (TURN_END_EVENTS.has(event.type)) {
          this.turnEnded = true;
          break;
        }
      }
    } catch {
      // A dropped connection or an idle abort: the loop reconnects.
    } finally {
      clearTimeout(idle);
      controller.abort();
    }
  }
}
