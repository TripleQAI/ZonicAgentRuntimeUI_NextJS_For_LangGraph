import { OIDC_PROVIDER_ID, signIn } from '@/auth';
import { Brand } from '@/components/shell/Brand';
import { Footer } from '@/components/shell/Footer';
import { t } from '@/lib/i18n/t';

/** The sign-in page (task U0-02): one action, the configured OIDC provider. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="px-6 py-5">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <section className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-glow">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tq-run">{t('app.name')}</p>
          <h1 className="mt-2 text-xl font-semibold">{t('auth.title')}</h1>
          <p className="mt-2 text-base text-muted">{t('auth.lead')}</p>
          {error && (
            <p role="alert" className="mt-4 rounded-md border-l-4 border-danger bg-raised p-3 text-sm">
              {t('auth.error')}
            </p>
          )}
          <form
            className="mt-6"
            action={async () => {
              'use server';
              await signIn(OIDC_PROVIDER_ID, { redirectTo: callbackUrl ?? '/' });
            }}
          >
            <button type="submit" className="btn-primary w-full py-3">
              {t('auth.signIn')}
            </button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
