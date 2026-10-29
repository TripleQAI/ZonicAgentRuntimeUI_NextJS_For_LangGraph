'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import { t } from '@/lib/i18n/t';
import { useRunStore } from '@/store/run';

/**
 * The prompt shown when the runtime answers 401 because the session's token could not be refreshed
 * (case U-11, decision UB-8): signing in again returns to this page, and the composer's draft is
 * still there (drafts live in session storage), so no typed input is lost.
 */
export function SignInPrompt() {
  const expired = useRunStore((state) => state.authExpired);
  const pathname = usePathname();
  const action = useRef<HTMLAnchorElement>(null);
  const id = useId();

  useEffect(() => {
    if (expired) action.current?.focus();
  }, [expired]);

  if (!expired) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        className="w-full max-w-md rounded-md bg-page p-6 shadow-md"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {t('auth.expiredTitle')}
        </h2>
        <p id={`${id}-text`} className="mt-2 text-base text-muted">
          {t('auth.expiredText')}
        </p>
        <a
          ref={action}
          href={`/login?callbackUrl=${encodeURIComponent(pathname || '/')}`}
          className="btn-primary mt-4 inline-block"
        >
          {t('auth.signInAgain')}
        </a>
      </div>
    </div>
  );
}
