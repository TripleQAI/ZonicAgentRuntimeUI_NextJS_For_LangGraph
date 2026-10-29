import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MarkdownPart } from '@/lib/api/generated/models';

/** Only web and mail links survive; `javascript:`, `data:` and the like become empty (case X-07). */
const SAFE_URL = /^(https?:|mailto:|#|\/(?!\/))/i;
export const safeUrl = (url: string): string => {
  const cleaned = defaultUrlTransform(url);
  return SAFE_URL.test(cleaned) ? cleaned : '';
};

/**
 * Markdown with sanitizing (design Section 12.5): GitHub-flavoured markdown, raw HTML dropped
 * rather than rendered (`skipHtml`), unsafe URLs removed, links opened in a new tab without access
 * to this window. Nothing from the text reaches the DOM as HTML.
 */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function MarkdownRenderer({ part }: { part: MarkdownPart }) {
  return <MarkdownText text={part.text ?? ''} />;
}
