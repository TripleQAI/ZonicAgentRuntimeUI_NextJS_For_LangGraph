import type { FilePart } from '@/lib/api/generated/models';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';

/**
 * A download link. `downloadRef` is a runtime API path (fetched through the same-origin proxy, which
 * adds the token) or an https URL; anything else is shown as the file name only.
 */
export function downloadHref(ref: string): string | undefined {
  if (ref.startsWith('/v1/')) return `${publicConfig.apiBasePath}${ref}`;
  if (/^https:\/\//i.test(ref)) return ref;
  return undefined;
}

export function FileRenderer({ part }: { part: FilePart }) {
  const href = downloadHref(part.downloadRef);
  return (
    <p className="my-3 flex items-center gap-2 text-sm">
      <span aria-hidden className="rounded-md bg-surface px-2 py-1 text-xs font-semibold uppercase">
        {part.mediaType.split('/').pop()}
      </span>
      {href ? (
        <a href={href} download={part.name} rel="noopener noreferrer" className="link">
          {t('content.download', { name: part.name })}
        </a>
      ) : (
        <span>{part.name}</span>
      )}
    </p>
  );
}
