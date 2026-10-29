'use client';

import { ApiError } from '@/lib/api/client';
import { errorMessage } from '@/lib/errors';
import { t } from '@/lib/i18n/t';
import type { RunErrorInfo } from '@/store/run';

export interface ErrorNoticeProps {
  /** An `ApiError`, a run's error, or anything thrown. */
  error: unknown;
  /** Offered only when the error is retryable (case U-10). */
  onRetry?: () => void;
}

const infoOf = (error: unknown): RunErrorInfo => {
  if (error instanceof ApiError)
    return { code: error.code, message: error.message, retryable: error.retryable, requestId: error.requestId };
  if (typeof error === 'object' && error !== null && typeof (error as RunErrorInfo).code === 'string')
    return error as RunErrorInfo;
  return { code: 'UNEXPECTED', message: t('error.unexpected'), retryable: false };
};

/**
 * The runtime's error envelope shown to the user (task U5-03, case U-10): the message catalog's
 * text for codes the UI knows, otherwise the envelope's user-safe message; the request ID for
 * support; and Retry when the code is retryable.
 */
export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  const info = infoOf(error);
  return (
    <div role="alert" className="my-2 rounded-md border-l-4 border-danger bg-surface px-3 py-2 text-sm">
      <p className="font-semibold">{errorMessage(info.code, info.message)}</p>
      {info.requestId && (
        <p className="mt-1 text-xs text-muted">{t('error.reference', { id: info.requestId })}</p>
      )}
      {info.retryable && onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-2 px-3 py-1 text-sm">
          {t('error.retry')}
        </button>
      )}
    </div>
  );
}
