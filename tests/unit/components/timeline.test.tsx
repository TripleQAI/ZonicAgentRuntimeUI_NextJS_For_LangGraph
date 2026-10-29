import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunTimeline } from '@/components/timeline/RunTimeline';
import { stepsFromEvents } from '@/lib/timeline';
import { axeViolations } from '../support/axe';
import { envelope, ev, fakeRuntime, json, sse, type FakeRuntime } from '../support/fake-runtime';
import { renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

/** The Customer Support Swarm's events (server fixture F-11): triage hands off to billing. */
const swarmEvents = [
  ev(1, 'run.started', { sessionId: 's-1', agenticWorkflowId: 'wf', revision: '1' }),
  ev(2, 'node.started', { nodeType: 'swarm', nodeName: 'Support Swarm', visit: 1 }, { nodeId: 'swarm' }),
  ev(3, 'swarm.member.started', { member: 'triage' }, { nodeId: 'swarm' }),
  ev(4, 'tool.started', { toolName: 'lookup_account', toolUseId: 'u1', member: 'triage' }, { nodeId: 'swarm' }),
  ev(5, 'tool.finished', { toolUseId: 'u1', member: 'triage', status: 'success', durationMs: 120 }, { nodeId: 'swarm' }),
  ev(6, 'swarm.member.finished', { member: 'triage', status: 'completed', durationMs: 900 }, { nodeId: 'swarm' }),
  ev(7, 'swarm.handoff', { from: 'triage', to: ['billing'], message: 'Billing question' }, { nodeId: 'swarm' }),
  ev(8, 'swarm.member.started', { member: 'billing' }, { nodeId: 'swarm' }),
  ev(9, 'token.delta', { text: 'Your invoice', member: 'billing' }, { nodeId: 'swarm' }),
  ev(10, 'swarm.member.finished', { member: 'billing', status: 'completed', durationMs: 1500 }, { nodeId: 'swarm' }),
  ev(11, 'node.finished', { status: 'succeeded', durationMs: 2600, handles: ['default'] }, { nodeId: 'swarm' }),
  ev(12, 'run.completed', { result: { text: 'Your invoice is paid.' } }),
];

let runtime: FakeRuntime;
beforeEach(() => {
  runtime = fakeRuntime();
  runtime.on('GET /v1/runs/{runId}', {
    runId: 'run-1',
    sessionId: 's-1',
    agenticWorkflowId: 'wf',
    revision: '1',
    status: 'succeeded',
    mode: 'stream',
    usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
    queuedAt: '2026-10-27T09:00:00Z',
    pendingInterrupts: [],
  });
  runtime.on('GET /v1/runs/{runId}/nodes', {
    items: [{ nodeId: 'swarm', nodeType: 'swarm', visit: 1, status: 'succeeded', startedAt: '2026-10-27T09:00:00Z', durationMs: 2600, handles: ['default'] }],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('run timeline', () => {
  it('[U-08] swarm steps are in order with member names, tools under their member and the handoff', () => {
    const steps = stepsFromEvents(swarmEvents);
    expect(
      steps.map((step) =>
        step.kind === 'member'
          ? `member ${step.member} ${step.status}`
          : step.kind === 'handoff'
            ? `handoff ${step.from}>${step.to.join(',')}`
            : step.kind === 'tool'
              ? `tool ${step.name} by ${step.member} ${step.status}`
              : step.kind === 'node'
                ? `node ${step.name} ${step.status}`
                : step.kind,
      ),
    ).toEqual([
      'node Support Swarm succeeded',
      'member triage completed',
      'tool lookup_account by triage success',
      'handoff triage>billing',
      'member billing completed',
    ]);
  });

  it('[U-08] the run page shows the timeline from the run events, usage and cost, and the trace', async () => {
    runtime.on('GET /v1/runs/{runId}/events', () => sse(swarmEvents));
    runtime.on('GET /v1/runs/{runId}/trace', {
      traceId: 't-1',
      observationCount: 2,
      errorCount: 0,
      inputTokens: 1200,
      outputTokens: 300,
      totalCost: 0.0123,
      tags: [],
      scores: [],
      observations: [
        {
          observationId: 'o-1',
          type: 'SPAN',
          name: 'Support Swarm',
          level: 'DEFAULT',
          startTime: '2026-10-27T09:00:00Z',
          latencyMs: 2600,
          metadata: {},
          children: [
            { observationId: 'o-2', type: 'GENERATION', name: 'billing', level: 'DEFAULT', model: 'claude-sonnet-4-6', startTime: '2026-10-27T09:00:01Z', metadata: {}, children: [] },
          ],
        },
      ],
    });
    const { container } = renderApp(<RunTimeline runId="run-1" />);
    const steps = await screen.findByRole('list', { name: 'Steps' });
    await waitFor(() => expect(within(steps).getAllByRole('listitem')).toHaveLength(5));
    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Support Swarm (swarm)'),
      expect.stringContaining('Agent triage'),
      expect.stringContaining('Tool lookup_account by triage'),
      expect.stringContaining('Handoff from triage to billing'),
      expect.stringContaining('Agent billing'),
    ]);
    expect(screen.getByTestId('run-status')).toHaveTextContent('succeeded');
    expect(screen.getByText('1,200 in, 300 out')).toBeInTheDocument();
    expect(await screen.findByText('$0.0123')).toBeInTheDocument();
    const trace = screen.getByRole('list', { name: 'Trace' });
    expect(within(trace).getByText('billing')).toBeInTheDocument();
    expect(trace).toHaveTextContent('claude-sonnet-4-6');
    expect(runtime.calls('GET /v1/runs/{runId}/events')[0]!.headers['last-event-id']).toBeUndefined();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('[U-08] once the replay buffer is gone, the steps come from the saved node timeline; no trace role, no trace', async () => {
    runtime.on('GET /v1/runs/{runId}/events', () =>
      sse([ev(1, 'stream.gap', { fromSeq: 1 }), ev(2, 'run.completed', { result: {} })]),
    );
    runtime.on('GET /v1/runs/{runId}/trace', envelope(403, 'FORBIDDEN', 'You do not have permission.'));
    renderApp(<RunTimeline runId="run-1" />);
    const steps = await screen.findByRole('list', { name: 'Steps' });
    await waitFor(() => expect(within(steps).getAllByRole('listitem')).toHaveLength(1));
    // The LangGraph runtime's node timeline names no node: the node ID stands in.
    expect(steps).toHaveTextContent('swarm (swarm)');
    expect(await screen.findByText('The trace is not available for this run or your role.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the runtime error of a run that is not found', async () => {
    runtime.on('GET /v1/runs/{runId}', envelope(404, 'NOT_FOUND', 'The requested item was not found.'));
    runtime.on('GET /v1/runs/{runId}/nodes', json({ items: [] }));
    runtime.on('GET /v1/runs/{runId}/events', envelope(404, 'NOT_FOUND', 'The requested item was not found.'));
    runtime.on('GET /v1/runs/{runId}/trace', envelope(404, 'NOT_FOUND', 'The requested item was not found.'));
    renderApp(<RunTimeline runId="run-x" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The requested item was not found.');
  });
});
