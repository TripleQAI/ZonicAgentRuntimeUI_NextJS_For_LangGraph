import type { CardPart } from '@/lib/api/generated/models';
import { MarkdownText } from './MarkdownRenderer';
import { formatValue } from './format';

/** A card: title, markdown body, labelled fields. Actions are listed; they run nothing in the UI. */
export function CardRenderer({ part }: { part: CardPart }) {
  // An event's part may leave out empty lists.
  const fields = part.fields ?? [];
  const actions = part.actions ?? [];
  return (
    <article className="my-3 rounded-md border border-line bg-page p-4 shadow-sm">
      <h2 className="text-base font-semibold">{part.title}</h2>
      {part.body && <MarkdownText text={part.body} />}
      {fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {fields.map((field, index) => (
            <div key={`${field.label}-${index}`} className="contents">
              <dt className="font-semibold text-muted">{field.label}</dt>
              <dd>{formatValue(field.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {actions.map((action, index) => (
            <li key={`${action.label}-${index}`} className="rounded-md border border-line px-3 py-1 font-semibold">
              {action.label}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
