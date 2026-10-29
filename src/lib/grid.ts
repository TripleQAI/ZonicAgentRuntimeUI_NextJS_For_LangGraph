import type { RuntimeApi } from '@/lib/api/runtime';

/** The parts of AG Grid's infinite-model request this adapter reads. */
export interface GridRowsRequest {
  startRow: number;
  endRow: number;
  sortModel: readonly { colId: string; sort: 'asc' | 'desc' | null | undefined }[];
  filterModel: Record<string, unknown> | null;
  successCallback(rows: unknown[], lastRow?: number): void;
  failCallback(): void;
}

/** A text filter's "contains" value, the one filter `/v1/datasets` applies. */
const filterText = (model: unknown): string | undefined => {
  if (typeof model !== 'object' || model === null) return undefined;
  const value = (model as { filter?: unknown }).filter;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

/**
 * AG Grid's server-side paging through `GET /v1/datasets/{id}` (design Section 12.5, case U-06):
 * each block of `pageSize` rows is one page; the first sorted column becomes `sort` (`field` or
 * `field:desc`) and text filters become the `filter` object, so the runtime sorts and filters the
 * whole dataset, not just the page on screen.
 */
export function datasetSource(
  api: Pick<RuntimeApi, 'datasetPage'>,
  datasetId: string,
  pageSize: number,
  onError: (error: unknown) => void,
) {
  return {
    rowCount: undefined,
    getRows: async (request: GridRowsRequest) => {
      const page = Math.floor(request.startRow / pageSize) + 1;
      const [sorted] = request.sortModel.filter((item) => item.sort === 'asc' || item.sort === 'desc');
      const filter: Record<string, string> = {};
      for (const [field, model] of Object.entries(request.filterModel ?? {})) {
        const text = filterText(model);
        if (text !== undefined && text !== '') filter[field] = text;
      }
      try {
        const result = await api.datasetPage(datasetId, {
          page,
          pageSize,
          ...(sorted ? { sort: sorted.sort === 'desc' ? `${sorted.colId}:desc` : sorted.colId } : {}),
          filter,
        });
        request.successCallback(result.rows, result.total);
      } catch (error) {
        request.failCallback();
        onError(error);
      }
    },
  };
}

/** Column definition keys a grid part may set; anything else (renderers, code) is dropped. */
const COLUMN_KEYS = ['field', 'headerName', 'width', 'minWidth', 'maxWidth', 'flex', 'sortable', 'resizable', 'hide'];

/** The grid part's builder column definitions, allow-listed, or the dataset's column names. */
export function columnDefs(
  columns: readonly unknown[],
  fallback: readonly string[],
  filters: boolean,
): Record<string, unknown>[] {
  const defs = columns
    .filter((column): column is Record<string, unknown> => typeof column === 'object' && column !== null)
    .map((column) => {
      const field = String(column.field ?? column.key ?? '');
      const def: Record<string, unknown> = { field };
      for (const key of COLUMN_KEYS) if (key in column && key !== 'field') def[key] = column[key];
      if (typeof column.label === 'string' && def.headerName === undefined) def.headerName = column.label;
      return def;
    })
    .filter((def) => def.field !== '');
  const list = defs.length > 0 ? defs : fallback.map((field) => ({ field }));
  return list.map((def) => ({
    sortable: true,
    ...def,
    ...(filters ? { filter: 'agTextColumnFilter', filterParams: { filterOptions: ['contains'], maxNumConditions: 1 } } : {}),
  }));
}
