import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewChat } from '@/components/catalog/NewChat';
import { axeViolations } from '../support/axe';
import { ev, fakeRuntime, SseFeed, type FakeRuntime } from '../support/fake-runtime';
import { navigation, renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

const agents = [
  { agenticWorkflowId: 'wf-energy', name: 'energy', displayName: 'Energy Analyst', description: 'Energy use by site.', bpc: 'FSH' },
  { agenticWorkflowId: 'wf-support', name: 'support', displayName: 'Customer Support', description: 'Answers questions.' },
];

let runtime: FakeRuntime;
beforeEach(() => {
  navigation.push.mockReset();
  runtime = fakeRuntime();
  runtime.on('GET /v1/catalog/agents', { items: agents });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('catalog and composer', () => {
  it('[U-01] the new chat preselects the first agent; choosing another and sending starts a chat with that workflow', async () => {
    const feed = new SseFeed();
    runtime.on('POST /v1/runs', () => feed.response);
    const { container } = renderApp(<NewChat />);
    expect(await screen.findByRole('heading', { name: 'What can I help you with?' })).toBeInTheDocument();
    const chips = within(await screen.findByRole('list', { name: 'Agents' })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      expect.stringContaining('Energy Analyst'),
      expect.stringContaining('Customer Support'),
    ]);
    // Chat first: the composer is ready at once, for the first agent.
    expect(screen.getByRole('button', { name: /Energy Analyst/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Message Energy Analyst');
    expect(screen.getByText('Energy use by site.')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Customer Support/ }));
    expect(screen.getByRole('button', { name: /Customer Support/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Energy Analyst/ })).toHaveAttribute('aria-pressed', 'false');
    const composer = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(composer).toHaveFocus());
    expect(composer).toHaveAttribute('placeholder', 'Message Customer Support');
    await user.type(composer, 'Where is my order?{Enter}');

    const [start] = runtime.calls('POST /v1/runs');
    expect(start!.body).toEqual({ agenticWorkflowId: 'wf-support', input: { text: 'Where is my order?' }, mode: 'stream' });
    // The runtime creates the session; the chat page takes over once the run names it.
    feed.send(ev(1, 'run.started', { sessionId: 'sess-new', agenticWorkflowId: 'wf-support', revision: '3' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/chat/sess-new'));
    feed.end();
  });

  it('[U-01] a preselected agent opens with its composer; switching agents keeps one draft per agent', async () => {
    renderApp(<NewChat initialAgentId="wf-support" />);
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Message Customer Support');
    await userEvent.setup().click(screen.getByRole('button', { name: /Energy Analyst/ }));
    const composer = await screen.findByRole('textbox', { name: 'Message' });
    expect(composer).toHaveAttribute('placeholder', 'Message Energy Analyst');
    const user = userEvent.setup();
    await user.type(composer, 'kWh last week');
    await user.click(screen.getByRole('button', { name: /Customer Support/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(''));
    await user.click(screen.getByRole('button', { name: /Energy Analyst/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('kWh last week'));
  });

  it('shows that no agents are available', async () => {
    runtime.on('GET /v1/catalog/agents', { items: [] });
    renderApp(<NewChat />);
    expect(await screen.findByText('No agents are available to you yet.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
