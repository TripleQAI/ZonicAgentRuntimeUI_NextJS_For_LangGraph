import type { HtmlPart } from '@/lib/api/generated/models';
import { t } from '@/lib/i18n/t';

/**
 * The builder's `htmlTemplate` views (design Section 12.5): HTML the runtime sanitized, shown in an
 * `iframe` sandboxed without any permission, so no script, form or navigation can run even if the
 * sanitizer missed something. This is the only place server HTML reaches the page.
 */
export function HtmlRenderer({ part }: { part: HtmlPart }) {
  return (
    <iframe
      title={t('content.htmlView')}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={part.html}
      className="my-3 h-80 w-full rounded-md border border-line bg-white"
    />
  );
}
