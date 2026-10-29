import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/components/shell/AppShell';
import { ErrorBoundary } from '@/components/shell/ErrorBoundary';
import { ApiError } from '@/lib/api/client';

describe('application shell', () => {
  it('renders the TripleQ AI top bar, the chat sidebar and the chat area, without a footer', () => {
    render(
      <AppShell userName="Ada Lovelace" signOut={<button type="button">Sign out</button>}>
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'TripleQ AI Agent Run' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TripleQ AI Agent Run, new chat' })).toHaveAttribute('href', '/');
    expect(document.querySelector('img[src="/tripleq-logo.png"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Agents' })).toBeNull();
    expect(screen.getByLabelText('Signed in as Ada Lovelace')).toHaveTextContent('AL');
    expect(screen.getByRole('complementary', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('content');
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(document.body).not.toHaveTextContent(/insite/i);
  });

  it('toggles the sidebar drawer for narrow screens with an accessible button', async () => {
    render(
      <AppShell userName="u@example.com" signOut={null}>
        <p>content</p>
      </AppShell>,
    );
    const toggle = screen.getByRole('button', { name: 'Open the chat list' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close the chat list' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('error boundary', () => {
  function Thrower({ error }: { error?: Error }): null {
    if (error) throw error;
    return null;
  }

  it('shows the runtime message of an ApiError and offers a retry', async () => {
    const onError = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', onError);
    const { rerender } = render(
      <ErrorBoundary>
        <Thrower error={new ApiError(503, 'MODEL_BUSY', 'The model is busy. Try again shortly.', 'r', true)} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The model is busy. Try again shortly.');
    rerender(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    window.removeEventListener('error', onError);
  });

  it('shows the generic catalog message for other errors', () => {
    const onError = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', onError);
    render(
      <ErrorBoundary>
        <Thrower error={new Error('internal detail')} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
    window.removeEventListener('error', onError);
  });
});
