/** A cell or field value as text: strings as they are, numbers localized, anything else as JSON. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Whether a value right-aligns with tabular figures. */
export const isNumeric = (value: unknown): boolean => typeof value === 'number';
