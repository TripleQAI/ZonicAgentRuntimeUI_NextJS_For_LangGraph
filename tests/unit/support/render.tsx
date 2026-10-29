import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useDrafts } from '@/store/drafts';
import { useRunStore } from '@/store/run';

/** The Next.js navigation hooks, controllable from tests (`vi.mock('next/navigation', ...)`). */
export const navigation = {
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
};

export const nextNavigationMock = () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
});

/** Resets the stores: no live runs, no drafts, signed in. */
export function resetStores() {
  useRunStore.setState({ runs: {}, authExpired: false });
  useDrafts.setState({ drafts: {} });
}

/** Renders inside the app's providers (a fresh query cache each time); the stores start empty. */
export function renderApp(ui: ReactElement, options?: RenderOptions) {
  resetStores();
  return render(ui, { wrapper: Providers, ...options });
}
