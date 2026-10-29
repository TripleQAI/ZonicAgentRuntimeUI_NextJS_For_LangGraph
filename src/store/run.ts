import { create } from 'zustand';
import { ApiError } from '@/lib/api/client';
import { runtimeApi, type RuntimeApi, type StartRunRequest } from '@/lib/api/runtime';
import { asContentPart, type ContentPart, type TypedRunEvent } from '@/lib/api/types';
import type { InterruptRequestedData, WarningData } from '@/lib/api/generated/models';
import { publicConfig, type StreamConfig } from '@/lib/config/runtime';
import { RunStream, type StreamState } from '@/lib/stream/run-stream';
import { TIMELINE_EVENTS } from '@/lib/timeline';

export type LiveStatus = 'starting' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

/** Text one node (or swarm member) streamed, in order. */
export interface Segment {
  nodeId?: string;
  member?: string;
  text: string;
}

export interface PendingInterrupt extends Omit<InterruptRequestedData, 'prompt' | 'expiresAt' | 'schema'> {
  prompt?: string;
  expiresAt?: string;
  schema: Record<string, unknown>;
  nodeId?: string;
}

export interface RunErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  status?: number;
  details?: ApiError['details'];
}

/** A run this browser streams (task U5-02): what the chat and the timeline show while it runs. */
export interface LiveRun {
  /** Client key: known before the run ID, which arrives with `run.started`. */
  key: string;
  runId?: string;
  sessionId?: string;
  agenticWorkflowId?: string;
  /** The user's message that started the run (empty for a run attached after a reload). */
  input: string;
  status: LiveStatus;
  connection: StreamState;
  segments: Segment[];
  parts: ContentPart[];
  /** Node, tool, swarm, interrupt and warning events, for the run's steps. */
  events: TypedRunEvent[];
  interrupts: PendingInterrupt[];
  warnings: WarningData[];
  result?: Record<string, unknown>;
  error?: RunErrorInfo;
  /** Stop was pressed: the text so far stays, marked as stopped (case U-03). */
  stopped: boolean;
  stopping: boolean;
  /** Events were lost (`stream.gap`): the saved messages are the record. */
  gap: boolean;
  lastSeq: number;
}

const newRun = (key: string, fields: Partial<LiveRun>): LiveRun => ({
  key,
  input: '',
  status: 'starting',
  connection: 'connecting',
  segments: [],
  parts: [],
  events: [],
  interrupts: [],
  warnings: [],
  stopped: false,
  stopping: false,
  gap: false,
  lastSeq: 0,
  ...fields,
});

/** One event applied to a run (the Observer of design Section 14.2 feeds every event through here). */
export function applyEvent(run: LiveRun, event: TypedRunEvent): LiveRun {
  if (event.seq <= run.lastSeq) return run;
  const next: LiveRun = { ...run, lastSeq: event.seq, runId: run.runId ?? event.runId };
  if (TIMELINE_EVENTS.has(event.type)) next.events = [...run.events, event];
  switch (event.type) {
    case 'run.started':
      return {
        ...next,
        status: 'running',
        ...(event.data.sessionId ? { sessionId: event.data.sessionId } : {}),
        agenticWorkflowId: event.data.agenticWorkflowId,
      };
    case 'node.started':
      return next.status === 'starting' || next.status === 'waiting' ? { ...next, status: 'running' } : next;
    case 'token.delta': {
      const segments = [...next.segments];
      const last = segments[segments.length - 1];
      const member = event.data.member;
      if (last && last.nodeId === event.nodeId && last.member === member)
        segments[segments.length - 1] = { ...last, text: last.text + event.data.text };
      else
        segments.push({
          ...(event.nodeId ? { nodeId: event.nodeId } : {}),
          ...(member ? { member } : {}),
          text: event.data.text,
        });
      return { ...next, segments };
    }
    case 'content.part':
      return { ...next, parts: [...next.parts, asContentPart(event.data.part ?? event.data)] };
    case 'interrupt.requested':
      return {
        ...next,
        interrupts: [
          ...next.interrupts.filter((item) => item.interruptId !== event.data.interruptId),
          {
            interruptId: event.data.interruptId,
            kind: event.data.kind,
            schema: event.data.schema ?? {},
            ...(event.data.prompt ? { prompt: event.data.prompt } : {}),
            ...(event.data.expiresAt ? { expiresAt: event.data.expiresAt } : {}),
            ...(event.nodeId ? { nodeId: event.nodeId } : {}),
          },
        ],
      };
    case 'warning':
      return { ...next, warnings: [...next.warnings, event.data] };
    case 'run.waiting':
      return { ...next, status: 'waiting' };
    case 'run.completed':
      return { ...next, status: 'completed', result: event.data.result, interrupts: [] };
    case 'run.failed':
      return {
        ...next,
        status: 'failed',
        interrupts: [],
        error: { code: event.data.code, message: event.data.message, retryable: event.data.retryable ?? false },
      };
    case 'run.cancelled':
      return { ...next, status: 'cancelled', interrupts: [] };
    case 'stream.gap':
      return { ...next, gap: true };
    default:
      return next;
  }
}

const errorInfo = (error: ApiError): RunErrorInfo => ({
  code: error.code,
  message: error.message,
  retryable: error.retryable,
  requestId: error.requestId,
  status: error.status,
  details: error.details,
});

export interface RunStoreState {
  runs: Record<string, LiveRun>;
  /** Set when the runtime answered 401: the sign-in prompt shows, input stays (case U-11). */
  authExpired: boolean;
  /** Starts a run; resolves with its key once the runtime accepted it, or with the refusal. */
  send(request: { sessionId?: string; agenticWorkflowId?: string; text: string }): Promise<{
    key: string;
    error?: RunErrorInfo;
  }>;
  /** Answers an interrupt of a run and streams the resumed turn; resolves with a refusal, if any. */
  answer(key: string, interruptId: string, answer: unknown): Promise<RunErrorInfo | undefined>;
  /** Follows a run started elsewhere (a reopened chat while it runs). */
  attach(run: { runId: string; sessionId: string; status: LiveStatus }): string;
  /** Cancels the run and keeps the text so far (case U-03). */
  stop(key: string): Promise<void>;
  dismiss(key: string): void;
  signedIn(): void;
}

export interface RunStoreDeps {
  api: RuntimeApi;
  config: StreamConfig;
  newKey?: () => string;
  /** Called when a run's turn ends, so the caller can reload saved messages and sessions. */
  onTurnEnd?: (run: LiveRun) => void;
}

/** The run store (Zustand): live runs by key; the streams live beside it, outside React. */
export function createRunStore(deps: RunStoreDeps) {
  const streams = new Map<string, RunStream>();
  const newKey = deps.newKey ?? (() => crypto.randomUUID());

  return create<RunStoreState>()((set, get) => {
    const patch = (key: string, change: (run: LiveRun) => LiveRun) =>
      set((state) => {
        const run = state.runs[key];
        return run ? { runs: { ...state.runs, [key]: change(run) } } : state;
      });

    const refused = (key: string, error: ApiError) => {
      if (error.status === 401) set({ authExpired: true });
      patch(key, (run) => ({ ...run, error: errorInfo(error) }));
    };

    /** Opens a stream for the run and wires its events into the store. */
    const streamFor = (key: string, onOpen: () => void, onRefused: (error: ApiError) => void): RunStream => {
      streams.get(key)?.close();
      const run = get().runs[key]!;
      let ended = false;
      const stream = new RunStream(
        deps.api,
        deps.config,
        {
          onEvent: (event) => {
            patch(key, (current) => applyEvent(current, event));
            const after = get().runs[key];
            if (after && after.status !== 'running' && after.status !== 'starting' && !ended) {
              ended = true;
              deps.onTurnEnd?.(after);
            }
          },
          onState: (connection) => patch(key, (current) => ({ ...current, connection })),
          onOpen,
          onError: (error, lost) => {
            if (!lost) return onRefused(error);
            refused(key, error);
            patch(key, (current) =>
              current.status === 'running' || current.status === 'starting' ? { ...current, status: 'failed' } : current,
            );
          },
        },
        { ...(run.runId ? { runId: run.runId } : {}), lastSeq: run.lastSeq },
      );
      streams.set(key, stream);
      return stream;
    };

    return {
      runs: {},
      authExpired: false,

      send: (request) =>
        new Promise((resolve) => {
          const key = newKey();
          set((state) => ({
            runs: {
              ...state.runs,
              [key]: newRun(key, {
                input: request.text,
                ...(request.sessionId ? { sessionId: request.sessionId } : {}),
                ...(request.agenticWorkflowId ? { agenticWorkflowId: request.agenticWorkflowId } : {}),
              }),
            },
          }));
          const body: StartRunRequest = {
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
            ...(request.agenticWorkflowId ? { agenticWorkflowId: request.agenticWorkflowId } : {}),
            input: { text: request.text },
            mode: 'stream',
          };
          const stream = streamFor(
            key,
            () => resolve({ key }),
            (error) => {
              refused(key, error);
              patch(key, (run) => ({ ...run, status: 'failed' }));
              resolve({ key, error: errorInfo(error) });
            },
          );
          // The run key doubles as the Idempotency-Key: a repeated start replays the same run.
          void stream.start(body, key);
        }),

      answer: (key, interruptId, answer) =>
        new Promise((resolve) => {
          const before = get().runs[key];
          if (!before?.runId) return resolve(undefined);
          const stream = streamFor(
            key,
            () => {
              patch(key, (run) => ({
                ...run,
                status: 'running',
                error: undefined,
                interrupts: run.interrupts.filter((item) => item.interruptId !== interruptId),
              }));
              resolve(undefined);
            },
            (error) => {
              if (error.status === 401) set({ authExpired: true });
              resolve(errorInfo(error));
            },
          );
          void stream.resume(interruptId, answer);
        }),

      attach: ({ runId, sessionId, status }) => {
        const existing = Object.values(get().runs).find((run) => run.runId === runId);
        if (existing) return existing.key;
        const key = newKey();
        set((state) => ({ runs: { ...state.runs, [key]: newRun(key, { runId, sessionId, status }) } }));
        if (status === 'running' || status === 'starting') {
          const stream = streamFor(
            key,
            () => undefined,
            (error) => refused(key, error),
          );
          void stream.attach();
        }
        return key;
      },

      stop: async (key) => {
        const run = get().runs[key];
        if (!run || run.stopping) return;
        patch(key, (current) => ({ ...current, stopping: true }));
        if (run.runId) {
          try {
            await deps.api.cancelRun(run.runId);
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) set({ authExpired: true });
          }
          // The stream ends with `run.cancelled`; past the wait it is closed anyway.
          const deadline = Date.now() + deps.config.cancelWaitMs;
          while (Date.now() < deadline && get().runs[key]?.status === 'running')
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        streams.get(key)?.close();
        streams.delete(key);
        patch(key, (current) => ({
          ...current,
          stopping: false,
          stopped: true,
          status: current.status === 'running' || current.status === 'starting' ? 'cancelled' : current.status,
        }));
        const after = get().runs[key];
        if (after) deps.onTurnEnd?.(after);
      },

      dismiss: (key) => {
        streams.get(key)?.close();
        streams.delete(key);
        set((state) => {
          const { [key]: _removed, ...rest } = state.runs;
          return { runs: rest };
        });
      },

      signedIn: () => set({ authExpired: false }),
    };
  });
}

export type RunStore = ReturnType<typeof createRunStore>;

/** Hooks the app can register to react to finished turns (the query cache refreshes messages). */
const turnEndListeners = new Set<(run: LiveRun) => void>();
export const onTurnEnd = (listener: (run: LiveRun) => void) => {
  turnEndListeners.add(listener);
  return () => void turnEndListeners.delete(listener);
};

export const useRunStore: RunStore = createRunStore({
  api: runtimeApi,
  config: publicConfig.stream,
  onTurnEnd: (run) => turnEndListeners.forEach((listener) => listener(run)),
});

/** The live runs of a session, oldest first. */
export const selectSessionRuns = (sessionId: string) => (state: RunStoreState) =>
  Object.values(state.runs).filter((run) => run.sessionId === sessionId);
