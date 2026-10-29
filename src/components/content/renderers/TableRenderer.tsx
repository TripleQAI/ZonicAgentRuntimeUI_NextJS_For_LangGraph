import type { TablePart } from '@/lib/api/generated/models';
import { t } from '@/lib/i18n/t';
import { formatValue, isNumeric } from './format';

/** A table with its rows inline (up to the runtime's `content.inlineRowLimit`). */
export function TableRenderer({ part }: { part: TablePart }) {
  const columns = part.columns ?? [];
  const rows = (part.rows ?? []).filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
  const total = part.datasetRef?.rowCount ?? undefined;
  return (
    <figure className="my-3 overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-sm">
        {part.title && <caption className="px-3 py-2 text-left font-semibold">{part.title}</caption>}
        <thead className="bg-surface">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold">
                {column.label ?? column.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-page even:bg-surface">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`border-b border-line px-3 py-2 ${isNumeric(row[column.key]) ? 'tabular text-right' : ''}`}
                >
                  {formatValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total !== undefined && total > rows.length && (
        <figcaption className="px-3 py-2 text-xs text-muted">
          {t('content.tablePreview', { shown: rows.length, total })}
        </figcaption>
      )}
    </figure>
  );
}
