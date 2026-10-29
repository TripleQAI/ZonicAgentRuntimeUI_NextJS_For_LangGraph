import type { CitationPart } from '@/lib/api/generated/models';
import { safeUrl } from './MarkdownRenderer';

/** A reference: title linked to its source (web links only), with the quoted snippet. */
export function CitationRenderer({ part }: { part: CitationPart }) {
  const href = safeUrl(part.url);
  return (
    <cite className="my-2 block border-l-4 border-primary pl-3 text-sm not-italic">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="link">
          {part.title}
        </a>
      ) : (
        <span className="font-semibold">{part.title}</span>
      )}
      {part.snippet && <span className="mt-1 block text-muted">{part.snippet}</span>}
    </cite>
  );
}
