import { t } from '@/lib/i18n/t';

/** The footer of the sign-in page. */
export function Footer() {
  return (
    <footer className="p-6 text-center text-xs text-muted">
      {t('app.footer', { year: new Date().getFullYear() })}
    </footer>
  );
}
