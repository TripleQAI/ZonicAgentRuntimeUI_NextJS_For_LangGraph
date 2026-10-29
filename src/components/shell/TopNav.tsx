import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n/t';
import { Brand } from './Brand';

export interface TopNavProps {
  userName: string;
  /** The sign-out control (a server action form), injected by the layout. */
  signOut: ReactNode;
  /** The sidebar toggle, shown on narrow screens only. */
  sidebarToggle?: ReactNode;
}

const initials = (name: string): string =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';

/** The top bar: the TripleQ AI mark (home, a new chat) and the signed-in user. Chat is the only page. */
export function TopNav({ userName, signOut, sidebarToggle }: TopNavProps) {
  return (
    <nav aria-label={t('nav.primary')} className="flex h-nav items-center gap-3 border-b border-line bg-page px-3 md:px-5">
      {sidebarToggle}
      <Link href="/" aria-label={t('nav.home')} className="rounded-md px-1 py-1">
        <Brand product />
      </Link>
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-sm font-medium">
        <span aria-label={t('nav.userMenu', { name: userName })} className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-raised text-xs font-semibold text-accent"
          >
            {initials(userName)}
          </span>
          <span className="hidden text-muted sm:inline">{userName}</span>
        </span>
        {signOut}
      </div>
    </nav>
  );
}
