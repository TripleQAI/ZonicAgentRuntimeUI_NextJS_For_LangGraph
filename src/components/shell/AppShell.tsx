'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@/lib/i18n/t';
import { TopNav } from './TopNav';

export interface AppShellProps {
  userName: string;
  signOut: ReactNode;
  /** Sidebar content: the session list (task U5-05). */
  sidebar?: ReactNode;
  children: ReactNode;
}

/**
 * Layout frame (task U0-04), chat first: a slim top bar, the conversation list in a sidebar that
 * becomes a drawer on narrow screens, and the chat filling the rest of the window.
 */
export function AppShell({ userName, signOut, sidebar, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const toggleButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  // The drawer closes when a link in it navigates (case U-09 on narrow screens).
  useEffect(() => setOpen(false), [pathname]);
  // Opening moves focus into the drawer; Escape closes it and returns focus to the toggle.
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>('a, button, input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (
    <button
      ref={toggleButton}
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-controls="session-sidebar"
      aria-label={open ? t('nav.closeSidebar') : t('nav.openSidebar')}
      className="rounded-md p-2 hover:bg-raised md:hidden"
    >
      <span aria-hidden className="block h-0.5 w-5 bg-text" />
      <span aria-hidden className="mt-1 block h-0.5 w-5 bg-text" />
      <span aria-hidden className="mt-1 block h-0.5 w-5 bg-text" />
    </button>
  );
  return (
    <div className="flex h-screen flex-col bg-page">
      <TopNav userName={userName} signOut={signOut} sidebarToggle={toggle} />
      <div className="relative flex min-h-0 flex-1">
        <aside
          ref={drawer}
          id="session-sidebar"
          aria-label={t('sidebar.title')}
          className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-sidebar flex-col border-r border-line bg-surface shadow-md md:static md:flex md:shadow-none`}
        >
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('sidebar.title')}</h2>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {sidebar ?? <p className="px-2 text-sm text-muted">{t('sidebar.empty')}</p>}
          </div>
        </aside>
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col bg-page">
          {children}
        </main>
      </div>
    </div>
  );
}
