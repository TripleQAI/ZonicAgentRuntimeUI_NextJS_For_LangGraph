import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { SignInPrompt } from '@/components/auth/SignInPrompt';
import { AppShell } from '@/components/shell/AppShell';
import { SessionSidebar } from '@/components/sidebar/SessionSidebar';
import { ErrorBoundary } from '@/components/shell/ErrorBoundary';
import { withBasePath } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';

/** The protected layout (task U0-02): every page under it needs a signed-in user. */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userName = session.user.name ?? session.user.email ?? '';

  const signOutControl = (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: withBasePath('/login') });
      }}
    >
      <button type="submit" className="btn-ghost px-3 py-1.5">
        {t('nav.signOut')}
      </button>
    </form>
  );

  return (
    <AppShell userName={userName} signOut={signOutControl} sidebar={<SessionSidebar />}>
      <ErrorBoundary>{children}</ErrorBoundary>
      <SignInPrompt />
    </AppShell>
  );
}
