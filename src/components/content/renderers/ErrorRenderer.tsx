import type { ErrorPart } from '@/lib/api/generated/models';

/** An error inside a message: the runtime's user-safe message, with its code for support. */
export function ErrorRenderer({ part }: { part: ErrorPart }) {
  return (
    <p role="note" className="my-2 rounded-md border-l-4 border-danger bg-surface px-3 py-2 text-sm">
      {part.message} <span className="text-xs text-muted">({part.code})</span>
    </p>
  );
}
