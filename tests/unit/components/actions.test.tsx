import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from '@/components/chat/ChatView';
import { copyText } from '@/components/chat/MessageActions';
import type { Message } from '@/lib/api/runtime';
import { envelope, fakeRuntime, json, type FakeRuntime } from '../support/fake-runtime';
import { renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

const SESSION = '33333333-3333-4333-8333-333333333333';
const answer: Message = {
  messageId: 'm-2',
  sessionId: SESSION,
  runId: 'run-5',
  seq: 2,
  role: 'assistant',
  kind: 'answer',
  visibility: 'chat',
  contentParts: [
    { type: 'markdown', text: 'Plant A used **1,200 kWh**.' },
    { type: 'table', columns: [{ key: 'site' }], rows: [{ site: 'Plant A' }] },
  ],
  textPreview: 'Plant A used 1,200 kWh.',
  createdAt: '2026-10-27T09:00:00Z',
};

let runtime: FakeRuntime;
beforeEach(() => {
  runtime = fakeRuntime();
  runtime.on('GET /v1/sessions/{sessionId}', {
    sessionId: SESSION,
    agenticWorkflowId: 'wf',
    title: 'Usage',
    status: 'active',
    createdAt: '2026-10-27T09:00:00Z',
    updatedAt: '2026-10-27T09:00:00Z',
    lastMessageAt: '2026-10-27T09:00:00Z',
  });
  runtime.on('GET /v1/sessions/{sessionId}/messages', { items: [answer] });
  runtime.on('GET /v1/runs/{runId}', { runId: 'run-5', sessionId: SESSION, status: 'succeeded', pendingInterrupts: [] });
  runtime.on('POST /v1/messages/{messageId}/feedback', () => json(undefined, 201));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('message actions', () => {
  it('[U-13] copy puts the answer on the clipboard; feedback rates then comments through the API', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderApp(<ChatView sessionId={SESSION} />);
    const actions = await screen.findByRole('group', { name: 'Message actions' });

    await user.click(within(actions).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Plant A used **1,200 kWh**.');
    expect(within(actions).getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await user.click(within(actions).getByRole('button', { name: 'Not helpful' }));
    await waitFor(() => expect(within(actions).getByRole('button', { name: 'Not helpful' })).toHaveAttribute('aria-pressed', 'true'));
    expect(runtime.calls('POST /v1/messages/{messageId}/feedback')[0]).toMatchObject({
      path: '/v1/messages/m-2/feedback',
      body: { rating: -1 },
    });
    await user.type(screen.getByRole('textbox', { name: 'Tell us more (optional)' }), 'Wrong site{Enter}');
    expect(await screen.findByText('Thanks for your feedback.')).toBeInTheDocument();
    expect(runtime.calls('POST /v1/messages/{messageId}/feedback')[1]!.body).toEqual({ rating: -1, comment: 'Wrong site' });

    expect(within(actions).getByRole('link', { name: 'Run details' })).toHaveAttribute('href', '/runs/run-5');
  });

  it('[U-13] Export to PDF prints the conversation; a failed rating shows the error', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    runtime.on('POST /v1/messages/{messageId}/feedback', envelope(404, 'NOT_FOUND', 'The requested item was not found.'));
    renderApp(<ChatView sessionId={SESSION} />);
    const actions = await screen.findByRole('group', { name: 'Message actions' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Export to PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
    await user.click(within(actions).getByRole('button', { name: 'Helpful' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The requested item was not found.');
    expect(within(actions).getByRole('button', { name: 'Helpful' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('copies the preview when a message has no markdown', () => {
    expect(copyText({ contentParts: [{ type: 'json', value: { a: 1 } }], textPreview: '{"a":1}' })).toBe('{"a":1}');
  });
});
