/** Plain JSON data only: functions, symbols and other non-data values are dropped. */
function plain(value: unknown, depth = 0): unknown {
  if (depth > 32) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map((item) => plain(item, depth + 1));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, plain(item, depth + 1)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
  }
  return undefined;
}

const memo = new WeakMap<object, Map<unknown, Record<string, unknown>>>();

/**
 * The option ECharts receives: the part's option as plain data, with the dataset's rows as
 * `dataset.source` when the option names a dataset but carries no data. Memoized per option and
 * rows, so a re-render does not redraw the chart.
 */
export function chartOption(option: Record<string, unknown>, rows?: unknown[]): Record<string, unknown> {
  const byRows = memo.get(option) ?? new Map<unknown, Record<string, unknown>>();
  memo.set(option, byRows);
  const cached = byRows.get(rows);
  if (cached) return cached;
  const result = (plain(option) ?? {}) as Record<string, unknown>;
  const dataset = result.dataset as { source?: unknown } | undefined;
  if (rows && rows.length > 0 && (dataset === undefined || dataset.source === undefined))
    result.dataset = { ...(dataset ?? {}), source: plain(rows) };
  byRows.set(rows, result);
  return result;
}
