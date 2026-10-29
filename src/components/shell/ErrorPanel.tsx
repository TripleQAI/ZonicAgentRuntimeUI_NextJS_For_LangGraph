'use client';

import { t } from '@/lib/i18n/t';

export interface ErrorPanelProps {
  message?: string;
  onRetry?: () => void;
}

/** What an error boundary shows: a catalog message and, when possible, a retry action. */
export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <section role="alert" className="m-6 max-w-xl rounded-md border-l-4 border-danger bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{t('error.title')}</h2>
      <p className="mt-2 text-base text-muted">{message ?? t('error.unexpected')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-primary mt-4"
        >
          {t('error.retry')}
        </button>
      )}
    </section>
  );
}
