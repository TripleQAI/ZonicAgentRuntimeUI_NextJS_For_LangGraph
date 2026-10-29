import type { JsonPart } from '@/lib/api/generated/models';
import { t } from '@/lib/i18n/t';

/** A collapsible JSON viewer: the summary shows the value's shape, the body the whole value. */
export function JsonRenderer({ part }: { part: JsonPart }) {
  const { value } = part;
  const summary = Array.isArray(value)
    ? t('content.jsonItems', { count: value.length })
    : typeof value === 'object' && value !== null
      ? t('content.jsonFields', { count: Object.keys(value).length })
      : t('content.jsonValue');
  return (
    <details className="my-3 rounded-md border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{summary}</summary>
      <pre className="overflow-x-auto px-3 pb-3 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
