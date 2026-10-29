import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeApi } from '@/lib/api/runtime';
import type { TypedRunEvent } from '@/lib/api/types';
import type { StreamConfig } from '@/lib/config/runtime';
import { RunStream } from '@/lib/stream/run-stream';
import { envelope, ev, fakeRuntime, sse, SseFeed, type FakeRuntime } from '../support/fake-runtime';

const config: StreamConfig = { reconnectAttempts: 3, reconnectDelayMs: 1, idleTimeoutMs: 200, cancelWaitMs: 50 };
const started = ev(1, 'run.started', { sessionId: 's-1', agenticWorkflowId: 'wf', revision: '1' });
const delta = (seq: number, text: string) => ev(seq, 'token.delta', { text }, { nodeId: 'llm' });
const completed = (seq: number) => ev(seq, 'run.completed', { result: { text: 'Hello world' } });

let runtime: FakeRuntime;
beforeEach(() => {
  runtime = fakeRuntime();
});
afterEach(() => vi.unstubAllGlobals());

function collect(known?: { runId?: string; lastSeq?: number }) {
  const events: TypedRunEvent[] = [];
  const errors: { code: string; lost: boolean }[] = [];
  const stream = new RunStream(
    createRuntimeApi(),
    config,
    { onEvent: (event) => events.push(event), onError: (error, lost) => errors.push({ code: error.code, lost }) },
    known,
  );
  return { stream, events, errors };
}

describe('stream client', () => {
  it('[U-04] a dropped stream reconnects with Last-Event-ID and delivers every event once', async () => {
    const first = new SseFeed();
    runtime.on('POST /v1/runs', () => first.response);
    // The reconnect replays from the buffer: event 3 again (already seen), then the rest.
    runtime.on('GET /v1/runs/{runId}/events', () => sse([delta(3, ' wor'), delta(4, 'ld'), completed(5)]));
    const { stream, events } = collect();
    const done = stream.start({ agenticWorkflowId: 'wf', input: { text: 'hi' }, mode: 'stream' }, 'key-1');
    first.send(started);
    first.send(delta(2, 'Hello'));
    first.send(delta(3, ' wor'));
    await vi.waitFor(() => expect(events).toHaveLength(3));
    first.fail();
    await done;
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
    const [reconnect] = runtime.calls('GET /v1/runs/{runId}/events');
    expect(reconnect!.path).toBe('/v1/runs/run-1/events');
    expect(reconnect!.headers['last-event-id']).toBe('3');
    expect(stream.lastSeq).toBe(5);
  });

  it('[U-04] a stream that goes quiet past the idle timeout (no heartbeat) is reopened', async () => {
    const quiet = new SseFeed();
    runtime.on('POST /v1/runs', () => quiet.response);
    runtime.on('GET /v1/runs/{runId}/events', () => sse([completed(3)]));
    const { stream, events } = collect();
    const done = stream.start({ agenticWorkflowId: 'wf', input: { text: 'hi' }, mode: 'stream' }, 'key-1');
    quiet.send(started);
    quiet.send(delta(2, 'Hi'));
    await done;
    expect(events.map((event) => event.type)).toEqual(['run.started', 'token.delta', 'run.completed']);
    expect(quiet.closed).toBe(true);
  });

  it('heartbeats keep a quiet stream open', async () => {
    const feed = new SseFeed();
    runtime.on('POST /v1/runs', () => feed.response);
    const { stream, events } = collect();
    const done = stream.start({ agenticWorkflowId: 'wf', input: { text: 'hi' }, mode: 'stream' }, 'key-1');
    feed.send(started);
    for (let index = 0; index < 4; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      feed.heartbeat(1);
    }
    feed.send(completed(2));
    await done;
    expect(runtime.calls('GET /v1/runs/{runId}/events')).toHaveLength(0);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
  });

  it('before the first event, the start is repeated with the same Idempotency-Key', async () => {
    let attempt = 0;
    runtime.on('POST /v1/runs', () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('connection reset');
      return sse([started, completed(2)]);
    });
    const { stream, events } = collect();
    await stream.start({ agenticWorkflowId: 'wf', input: { text: 'hi' }, mode: 'stream' }, 'key-7');
    const calls = runtime.calls('POST /v1/runs');
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.headers['idempotency-key'])).toEqual(['key-7', 'key-7']);
    expect(events).toHaveLength(2);
  });

  it('a refused start is reported once and not retried', async () => {
    runtime.on('POST /v1/runs', envelope(409, 'RUN_IN_PROGRESS', 'A run is already in progress.', true));
    const { stream, errors } = collect();
    await stream.start({ sessionId: 's-1', input: { text: 'hi' }, mode: 'stream' }, 'key-1');
    expect(errors).toEqual([{ code: 'RUN_IN_PROGRESS', lost: false }]);
    expect(runtime.calls('POST /v1/runs')).toHaveLength(1);
  });

  it('gives up after the configured reconnects and reports the stream lost', async () => {
    runtime.on('POST /v1/runs', () => sse([started]));
    runtime.on('GET /v1/runs/{runId}/events', () => {
      throw new TypeError('offline');
    });
    const { stream, errors } = collect();
    await stream.start({ agenticWorkflowId: 'wf', input: { text: 'hi' }, mode: 'stream' }, 'key-1');
    expect(errors).toEqual([{ code: 'STREAM_LOST', lost: true }]);
    expect(runtime.calls('GET /v1/runs/{runId}/events')).toHaveLength(config.reconnectAttempts);
  });

  it('delivers stream.gap like any other event, then the run status', async () => {
    runtime.on('GET /v1/runs/{runId}/events', () =>
      sse([ev(8, 'stream.gap', { fromSeq: 8 }), ev(9, 'run.completed', { result: {} })]),
    );
    const { stream, events } = collect({ runId: 'run-1', lastSeq: 7 });
    await stream.attach();
    expect(events.map((event) => event.type)).toEqual(['stream.gap', 'run.completed']);
    expect(runtime.calls('GET /v1/runs/{runId}/events')[0]!.headers['last-event-id']).toBe('7');
  });

  it('a resumed turn posts the answer in stream mode and continues the run', async () => {
    runtime.on('POST /v1/runs/{runId}/interrupts/{interruptId}', () =>
      sse([ev(5, 'node.started', { nodeType: 'llm', nodeName: 'Answer', visit: 1 }), completed(6)]),
    );
    const { stream, events } = collect({ runId: 'run-1', lastSeq: 4 });
    await stream.resume('int-1', { approved: true });
    const [call] = runtime.calls('POST /v1/runs/{runId}/interrupts/{interruptId}');
    expect(call!.path).toBe('/v1/runs/run-1/interrupts/int-1');
    expect(call!.body).toEqual({ answer: { approved: true }, mode: 'stream' });
    expect(events.map((event) => event.seq)).toEqual([5, 6]);
  });
});
