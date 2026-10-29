import en from '@messages/en.json';
import { t, type MessageKey } from '@/lib/i18n/t';

/**
 * The message for an error code: the UI catalog's `apiError.<CODE>` when it has one (codes the user
 * acts on: sign-in, busy, network), else the runtime's user-safe message from its own catalog.
 */
export function errorMessage(code: string, fallback: string): string {
  const key = `apiError.${code}`;
  return key in en ? t(key as MessageKey) : fallback || t('error.unexpected');
}
