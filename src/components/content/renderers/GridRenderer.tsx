'use client';

import { useQuery } from '@tanstack/react-query';
import {
  InfiniteRowModelModule,
  ModuleRegistry,
  PaginationModule,
  TextFilterModule,
  themeQuartz,
  type ColDef,
  type IDatasource,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo, useState } from 'react';
import { ErrorNotice } from '@/components/chat/ErrorNotice';
import type { GridPart } from '@/lib/api/generated/models';
import { runtimeApi } from '@/lib/api/runtime';
import { publicConfig } from '@/lib/config/runtime';
import { columnDefs, datasetSource } from '@/lib/grid';
import { t } from '@/lib/i18n/t';

ModuleRegistry.registerModules([InfiniteRowModelModule, PaginationModule, TextFilterModule]);

/** The TripleQ AI palette on AG Grid's Quartz theme (dark). */
const theme = themeQuartz.withParams({
  accentColor: 'var(--tq-accent)',
  browserColorScheme: 'dark',
  fontFamily: 'inherit',
  foregroundColor: 'var(--color-text)',
  backgroundColor: 'var(--color-bg)',
  headerBackgroundColor: 'var(--color-surface)',
  borderColor: 'var(--color-border)',
});

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

/** A grid in server mode (AG Grid's infinite row model) over `GET /v1/datasets/{id}` (case U-06). */
export default function GridRenderer({ part }: { part: GridPart }) {
  const datasetId = part.datasetRef?.datasetId;
  const partColumns = part.columns;
  // The builder's grid settings (`features`): an open object in the contract.
  const features = part.features as Record<string, unknown>;
  const pageSize = positive(part.pageSize) ?? publicConfig.paging.gridRows;
  const height = positive(features.height) ?? publicConfig.gridHeightPx;
  const sizes = Array.isArray(features.pageSizeOptions)
    ? (features.pageSizeOptions as unknown[]).map(positive).filter((size): size is number => size !== undefined)
    : [];
  const [error, setError] = useState<unknown>();
  // Without column definitions the first page names the columns.
  const needsColumns = !partColumns?.length;
  const first = useQuery({
    queryKey: ['dataset', datasetId, 'columns'],
    queryFn: () => runtimeApi.datasetPage(datasetId!, { page: 1, pageSize: 1 }),
    enabled: Boolean(datasetId) && needsColumns,
  });
  const columns = useMemo(
    () =>
      columnDefs(partColumns ?? [], first.data?.columns ?? part.datasetRef?.columns ?? [], features.filters !== false) as ColDef[],
    [partColumns, part.datasetRef?.columns, features.filters, first.data?.columns],
  );
  const datasource = useMemo<IDatasource | undefined>(
    () => (datasetId ? (datasetSource(runtimeApi, datasetId, pageSize, setError) as IDatasource) : undefined),
    [datasetId, pageSize],
  );

  if (!datasetId) return <p className="text-sm text-muted">{t('content.gridUnavailable')}</p>;
  if (needsColumns && first.isPending) return <p className="text-sm text-muted">{t('content.loading')}</p>;
  return (
    <figure className="my-3" aria-label={part.title ?? t('content.grid')}>
      {part.title && <figcaption className="mb-2 font-semibold">{part.title}</figcaption>}
      {error !== undefined && <ErrorNotice error={error} />}
      <div style={{ height }} data-testid="grid">
        <AgGridReact
          theme={theme}
          columnDefs={columns}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={pageSize}
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={sizes.length > 0 ? sizes : false}
          maxConcurrentDatasourceRequests={1}
          ensureDomOrder
        />
      </div>
    </figure>
  );
}
