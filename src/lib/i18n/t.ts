import en from '@messages/en.json';

/** Keys of the message catalog; a missing key is a type error. */
export type MessageKey = keyof typeof en;

const catalogs: Record<string, Record<string, string>> = { en };

/**
 * Translation helper over messages/<locale>.json (design rule 6: no user-facing sentence in code).
 * `{name}` placeholders are replaced from `params`; unknown placeholders stay visible.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}, locale = 'en'): string {
  const template = catalogs[locale]?.[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}
