import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInPrompt } from '@/components/auth/SignInPrompt';
import { ChatView } from '@/components/chat/ChatView';
import type { Message, Session } from '@/lib/api/runtime';
import { useDrafts } from '@/store/drafts';
import { useRunStore } from '@/store/run';
import { envelope, ev, fakeRuntime, json, sse, SseFeed, type FakeRuntime } from '../support/fake-runtime';
import { axeViolations } from '../support/axe';
import { renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

const SESSION = '11111111-1111-4111-8111-111111111111';
const session: Session = {
  sessionId: SESSION,
  agenticWorkflowId: 'wf-1',
  title: 'Energy report',
  status: 'active',
  createdAt: '2026-10-27T09:00:00Z',
  updatedAt: '2026-10-27T09:00:00Z',
  lastMessageAt: '2026-10-27T09:00:00Z',
};

const message = (seq: number, role: string, text: string, runId?: string): Message => ({
  messageId: `m-${seq}`,
  sessionId: SESSION,
  ...(runId ? { runId } : {}),
  seq,
  role,
  kind: role === 'user' ? 'user_input' : 'answer',
  visibility: 'chat',
  contentParts: [{ type: 'markdown', text }],
  textPreview: text,
  createdAt: '2026-10-27T09:00:00Z',
});

let runtime: FakeRuntime;
let saved: Message[];

beforeEach(() => {
  saved = [];
  runtime = fakeRuntime();
  runtime.on('GET /v1/sessions/{sessionId}', session);
  runtime.on('GET /v1/sessions/{sessionId}/messages', () => json({ items: [...saved].reverse() }));
  runtime.on('GET /v1/runs/{runId}', (request) =>
    json({ runId: request.path.split('/')[3], sessionId: SESSION, status: 'succeeded', pendingInterrupts: [] }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const composer = () => screen.getByRole('textbox', { name: 'Message' });
const liveText = () => screen.getByTestId('live-text');

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(composer(), text);
  await user.keyboard('{Enter}');
  return user;
}

describe('chat thread', () => {
  it('[U-02] streamed text renders incrementally as markdown and matches the final text', async () => {
    const feed = new SseFeed();
    runtime.on('POST /v1/runs', () => feed.response);
    renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Energy report' });
    await send('Summarize');

    feed.send(ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf-1', revision: '1' }));
    feed.send(ev(2, 'token.delta', { text: 'The **total** is' }, { nodeId: 'llm' }));
    await waitFor(() => expect(liveText()).toHaveTextContent('The total is'));
    expect(within(liveText()).getByText('total').tagName).toBe('STRONG');
    expect(liveText()).toHaveAttribute('aria-busy', 'true');

    feed.send(ev(3, 'token.delta', { text: ' 1,200 kWh.' }, { nodeId: 'llm' }));
    await waitFor(() => expect(liveText()).toHaveTextContent('The total is 1,200 kWh.'));

    // The turn ends; the saved answer replaces the live one with the same text.
    saved = [message(1, 'user', 'Summarize', 'run-1'), message(2, 'assistant', 'The **total** is 1,200 kWh.', 'run-1')];
    feed.send(ev(4, 'run.completed', { result: { text: 'The **total** is 1,200 kWh.' } }));
    feed.end();
    await waitFor(() => expect(screen.queryByTestId('live-text')).toBeNull());
    const answer = screen.getAllByRole('article', { name: 'Agent' }).at(-1)!;
    expect(answer).toHaveTextContent('The total is 1,200 kWh.');
    expect(screen.getAllByRole('article', { name: 'You' })).toHaveLength(1);
    const [start] = runtime.calls('POST /v1/runs');
    expect(start!.body).toEqual({ sessionId: SESSION, input: { text: 'Summarize' }, mode: 'stream' });
  });

  it('[U-03] Stop cancels the run and keeps the partial text, marked as stopped', async () => {
    const feed = new SseFeed();
    runtime.on('POST /v1/runs', () => feed.response);
    runtime.on('POST /v1/runs/{runId}/cancel', () => {
      feed.send(ev(3, 'run.cancelled', { reason: 'cancelled' }));
      feed.end();
      return json({ runId: 'run-1', status: 'cancelled' }, 202);
    });
    renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Energy report' });
    const user = await send('Write a long report');
    feed.send(ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf-1', revision: '1' }));
    feed.send(ev(2, 'token.delta', { text: 'Part one of the' }, { nodeId: 'llm' }));
    await waitFor(() => expect(liveText()).toHaveTextContent('Part one of the'));

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await screen.findByTestId('stopped');
    expect(runtime.calls('POST /v1/runs/{runId}/cancel')[0]!.path).toBe('/v1/runs/run-1/cancel');
    expect(liveText()).toHaveTextContent('Part one of the');
    expect(liveText()).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-status')).toHaveTextContent('You stopped the response.');
  });

  it('[U-10] a refused start shows the catalog message, its reference and Retry; Retry sends again', async () => {
    let attempt = 0;
    runtime.on('POST /v1/runs', () => {
      attempt += 1;
      return attempt === 1
        ? envelope(429, 'RATE_LIMITED', 'Too many requests.', true)
        : sse([ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf-1', revision: '1' }), ev(2, 'run.completed', { result: { text: 'ok' } })]);
    });
    renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Energy report' });
    const user = await send('Hello');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests. Try again in a moment.');
    expect(alert).toHaveTextContent('Reference: trace-RATE_LIMITED');
    // The text stays in the composer when the runtime refuses it.
    expect(composer()).toHaveValue('Hello');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(runtime.calls('POST /v1/runs')).toHaveLength(2));
    expect(runtime.calls('POST /v1/runs')[1]!.body).toMatchObject({ input: { text: 'Hello' } });
  });

  it('[U-10] a non-retryable failure has no Retry; a retryable run failure retries with the same input', async () => {
    runtime.on('POST /v1/runs', () =>
      sse([
        ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf-1', revision: '1' }),
        ev(2, 'run.failed', { code: 'NODE_TIMEOUT', message: 'A step of the workflow took too long.', retryable: true }),
      ]),
    );
    renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Energy report' });
    const user = await send('Report');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A step of the workflow took too long.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(runtime.calls('POST /v1/runs')).toHaveLength(2));

    cleanup();
    runtime.on('POST /v1/runs', envelope(404, 'WORKFLOW_NOT_FOUND', 'The workflow was not found.', false));
    renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Energy report' });
    await send('Again');
    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('The workflow was not found.');
    expect(within(refused).queryByRole('button')).toBeNull();
  });

  it('[U-11] an expired session shows the sign-in prompt and keeps the typed input across a reload', async () => {
    runtime.on('POST /v1/runs', envelope(401, 'AUTH_REQUIRED', 'Your session has ended.'));
    renderApp(
      <>
        <ChatView sessionId={SESSION} />
        <SignInPrompt />
      </>,
    );
    await screen.findByRole('heading', { name: 'Energy report' });
    await send('Draft that must survive');
    const prompt = await screen.findByRole('alertdialog', { name: 'Your session has ended' });
    const signIn = within(prompt).getByRole('link', { name: 'Sign in again' });
    expect(signIn).toHaveAttribute('href', '/login?callbackUrl=%2F');
    await waitFor(() => expect(signIn).toHaveFocus());
    expect(composer()).toHaveValue('Draft that must survive');
    expect(JSON.parse(sessionStorage.getItem('zonic-runtime-drafts')!).state.drafts[SESSION]).toBe('Draft that must survive');

    // After signing in again the page reloads: the draft comes back from session storage.
    cleanup();
    useRunStore.setState({ runs: {}, authExpired: false });
    await act(async () => {
      await useDrafts.persist.rehydrate();
    });
    const { unmount } = (await import('@testing-library/react')).render(<ChatView sessionId={SESSION} />, {
      wrapper: (await import('@/app/providers')).Providers,
    });
    await waitFor(() => expect(composer()).toHaveValue('Draft that must survive'));
    unmount();
  });

  it('[U-12] the thread passes axe, streams into a polite live region and is usable from the keyboard', async () => {
    saved = [message(1, 'user', 'Hi', 'run-0'), message(2, 'assistant', 'Hello! How can I help?', 'run-0')];
    const feed = new SseFeed();
    runtime.on('POST /v1/runs', () => feed.response);
    const { container } = renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByText('Hello! How can I help?');
    expect(await axeViolations(container)).toEqual([]);

    const user = userEvent.setup();
    await user.click(composer());
    await user.keyboard('line one{Shift>}{Enter}{/Shift}line two');
    expect(composer()).toHaveValue('line one\nline two');
    await user.keyboard('{Enter}');
    feed.send(ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf-1', revision: '1' }));
    feed.send(ev(2, 'token.delta', { text: 'Working' }, { nodeId: 'llm' }));
    await waitFor(() => expect(liveText()).toHaveTextContent('Working'));
    expect(liveText()).toHaveAttribute('aria-live', 'polite');
    expect(liveText()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('chat-status')).toHaveTextContent('The agent is responding.');
    // Focus stays in the composer while the answer streams.
    expect(composer()).toHaveFocus();
    expect(await axeViolations(container)).toEqual([]);
    feed.send(ev(3, 'run.completed', { result: { text: 'Working' } }));
    feed.end();
    await waitFor(() => expect(screen.getByTestId('chat-status')).toHaveTextContent('The agent finished responding.'));
  });

  it('[X-07] markdown with script tags, event handlers and javascript: links renders as inert text', async () => {
    saved = [
      message(
        1,
        'assistant',
        'Hi <script>window.__pwned = true</script><img src=x onerror="window.__pwned = true"> [link](javascript:alert(1)) <b onclick="x()">bold</b>',
        'run-0',
      ),
    ];
    const { container } = renderApp(<ChatView sessionId={SESSION} />);
    const answer = await screen.findByRole('article', { name: 'Agent' });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(within(answer).queryByRole('link', { name: 'link' })).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
