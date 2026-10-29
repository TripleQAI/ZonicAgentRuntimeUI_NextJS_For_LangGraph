import { describe, expect, it } from 'vitest';
import { applyEvent, type LiveRun } from '@/store/run';
import { ev } from '../support/fake-runtime';

const fresh = (): LiveRun => ({
  key: 'k',
  input: 'hi',
  status: 'starting',
  connection: 'open',
  segments: [],
  parts: [],
  events: [],
  interrupts: [],
  warnings: [],
  stopped: false,
  stopping: false,
  gap: false,
  lastSeq: 0,
});

describe('run store events', () => {
  it('builds the run from its events: session, text per node and member, parts, steps and outcome', () => {
    const events = [
      ev(1, 'run.started', { sessionId: 's-1', agenticWorkflowId: 'wf', revision: '1' }),
      ev(2, 'token.delta', { text: 'Hel' }, { nodeId: 'a' }),
      ev(3, 'token.delta', { text: 'lo' }, { nodeId: 'a' }),
      ev(4, 'token.delta', { text: 'Bills', member: 'billing' }, { nodeId: 'swarm' }),
      ev(5, 'content.part', { type: 'card', part: { type: 'card', title: 'T', fields: [], actions: [] } }),
      ev(6, 'warning', { code: 'view.data-missing', message: 'the grid has no dataset' }),
      ev(7, 'node.started', { nodeType: 'llm', nodeName: 'A', visit: 1 }, { nodeId: 'a' }),
      ev(8, 'run.completed', { result: { text: 'Hello' } }),
    ];
    const run = events.reduce(applyEvent, fresh());
    expect(run).toMatchObject({
      runId: 'run-1',
      sessionId: 's-1',
      status: 'completed',
      result: { text: 'Hello' },
      lastSeq: 8,
      segments: [
        { nodeId: 'a', text: 'Hello' },
        { nodeId: 'swarm', member: 'billing', text: 'Bills' },
      ],
      parts: [{ type: 'card', title: 'T' }],
      warnings: [{ code: 'view.data-missing' }],
    });
    expect(run.events.map((event) => event.type)).toEqual(['warning', 'node.started']);
  });

  it('ignores events it has already applied (a replay after a reconnect)', () => {
    const once = [ev(1, 'token.delta', { text: 'a' }, { nodeId: 'n' }), ev(2, 'token.delta', { text: 'b' }, { nodeId: 'n' })].reduce(
      applyEvent,
      fresh(),
    );
    const replayed = applyEvent(once, ev(2, 'token.delta', { text: 'b' }, { nodeId: 'n' }));
    expect(replayed).toBe(once);
    expect(replayed.segments).toEqual([{ nodeId: 'n', text: 'ab' }]);
  });

  it('a pause lists its interrupts; the end of the run clears them; a failure keeps its error', () => {
    const waiting = [
      ev(1, 'interrupt.requested', { interruptId: 'i-1', kind: 'approval', schema: {} }, { nodeId: 'approve' }),
      ev(2, 'run.waiting', { interruptIds: ['i-1'] }),
    ].reduce(applyEvent, fresh());
    expect(waiting.status).toBe('waiting');
    expect(waiting.interrupts).toEqual([{ interruptId: 'i-1', kind: 'approval', schema: {}, nodeId: 'approve' }]);
    const failed = applyEvent(waiting, ev(3, 'run.failed', { code: 'NODE_FAILED', message: 'A step failed.', retryable: false }));
    expect(failed).toMatchObject({ status: 'failed', interrupts: [], error: { code: 'NODE_FAILED', retryable: false } });
    expect(applyEvent(fresh(), ev(1, 'stream.gap', { fromSeq: 1 })).gap).toBe(true);
  });
});
