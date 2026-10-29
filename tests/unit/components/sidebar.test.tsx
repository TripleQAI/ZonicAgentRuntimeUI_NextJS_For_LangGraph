import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/shell/AppShell';
import { SessionSidebar } from '@/components/sidebar/SessionSidebar';
import type { Session } from '@/lib/api/runtime';
import { axeViolations } from '../support/axe';
import { fakeRuntime, json, type FakeRuntime } from '../support/fake-runtime';
import { navigation, renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

const session = (index: number, status: Session['status'] = 'active'): Session => ({
  sessionId: `s-${index}`,
  agenticWorkflowId: 'wf',
  title: `Conversation ${index}`,
  status,
  createdAt: '2026-10-27T09:00:00Z',
  updatedAt: '2026-10-27T09:00:00Z',
  lastMessageAt: '2026-10-27T09:00:00Z',
});

let runtime: FakeRuntime;
let sessions: Session[];
beforeEach(() => {
  navigation.push.mockReset();
  navigation.pathname = '/chat/s-2';
  sessions = Array.from({ length: 25 }, (_, index) => session(index + 1));
  runtime = fakeRuntime();
  // Cursor paging over the list, title search and status filter, as the runtime does them.
  runtime.on('GET /v1/sessions', (request) => {
    const q = request.query.get('q')?.toLowerCase();
    const status = request.query.get('status') ?? 'active';
    const limit = Number(request.query.get('limit'));
    const start = Number(request.query.get('cursor') || 0);
    const matching = sessions.filter(
      (item) => (status === 'all' || item.status === status) && (!q || item.title.toLowerCase().includes(q)),
    );
    const items = matching.slice(start, start + limit);
    return json({ items, ...(start + limit < matching.length ? { nextCursor: String(start + limit) } : {}) });
  });
  runtime.on('PATCH /v1/sessions/{sessionId}', (request) => {
    const id = request.path.split('/').pop()!;
    const target = sessions.find((item) => item.sessionId === id)!;
    Object.assign(target, request.body);
    return json(target);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const list = () => screen.getByRole('list', { name: 'Chats' });
const titles = () => within(list()).getAllByRole('link').map((link) => link.textContent);

describe('session sidebar', () => {
  it('[U-09] pages with the cursor, marks the current chat and searches by title', async () => {
    const { container } = renderApp(<SessionSidebar />);
    await waitFor(() => expect(titles()).toHaveLength(20));
    expect(within(list()).getByRole('link', { name: 'Conversation 2' })).toHaveAttribute('aria-current', 'page');
    expect(await axeViolations(container)).toEqual([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(titles()).toHaveLength(25));
    expect(runtime.calls('GET /v1/sessions').at(-1)!.query.get('cursor')).toBe('20');
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'conversation 1');
    await waitFor(() => expect(titles()).toEqual(['Conversation 1', ...Array.from({ length: 10 }, (_, i) => `Conversation ${10 + i}`)]));
    // One request after typing stops, not one per key.
    expect(runtime.calls('GET /v1/sessions').filter((call) => call.query.get('q'))).toHaveLength(1);
    await user.clear(screen.getByRole('searchbox', { name: 'Search chats' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'nothing like it');
    expect(await screen.findByText('No chats match.')).toBeInTheDocument();
  });

  it('[U-09] renames with the keyboard, archives and restores', async () => {
    renderApp(<SessionSidebar />);
    await waitFor(() => expect(titles()).toHaveLength(20));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rename Conversation 3' }));
    const input = screen.getByRole('textbox', { name: 'Chat name' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Boiler costs{Enter}');
    await waitFor(() => expect(within(list()).getByRole('link', { name: 'Boiler costs' })).toBeInTheDocument());
    expect(runtime.calls('PATCH /v1/sessions/{sessionId}')[0]).toMatchObject({ path: '/v1/sessions/s-3', body: { title: 'Boiler costs' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Boiler costs' })).toHaveFocus());

    // Escape cancels a rename.
    await user.click(screen.getByRole('button', { name: 'Rename Conversation 4' }));
    await user.keyboard('{Escape}');
    expect(runtime.calls('PATCH /v1/sessions/{sessionId}')).toHaveLength(1);

    // Archiving the open chat leaves it for the home page.
    await user.click(screen.getByRole('button', { name: 'Archive Conversation 2' }));
    await waitFor(() => expect(titles()).not.toContain('Conversation 2'));
    expect(runtime.calls('PATCH /v1/sessions/{sessionId}')[1]).toMatchObject({ path: '/v1/sessions/s-2', body: { status: 'archived' } });
    expect(navigation.push).toHaveBeenCalledWith('/');

    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() => expect(titles()).toEqual(['Conversation 2']));
    await user.click(screen.getByRole('button', { name: 'Restore Conversation 2' }));
    await waitFor(() => expect(screen.getByText('Your chats appear here.')).toBeInTheDocument());
    expect(runtime.calls('PATCH /v1/sessions/{sessionId}')[2]).toMatchObject({ body: { status: 'active' } });
  });

  it('[U-09] on a narrow screen the sidebar is a drawer: opens with focus inside, closes with Escape', async () => {
    renderApp(
      <AppShell userName="Ada" signOut={null} sidebar={<SessionSidebar />}>
        <p>chat</p>
      </AppShell>,
    );
    await waitFor(() => expect(titles()).toHaveLength(20));
    const drawer = screen.getByRole('complementary', { name: 'Chats' });
    expect(drawer.className).toContain('hidden');
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Open the chat list' });
    await user.click(toggle);
    expect(drawer.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(within(drawer).getByRole('link', { name: 'New chat' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(drawer.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(toggle).toHaveFocus();
  });
});
