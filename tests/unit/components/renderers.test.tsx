import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageContent } from '@/components/content/MessageContent';
import { renderers } from '@/components/content/renderers';
import { createRuntimeApi } from '@/lib/api/runtime';
import type { ContentPart } from '@/lib/api/types';
import { columnDefs, datasetSource, type GridRowsRequest } from '@/lib/grid';
import { axeViolations } from '../support/axe';
import { fakeRuntime, json, type FakeRuntime } from '../support/fake-runtime';
import { renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

// ECharts draws on a canvas or SVG that jsdom cannot lay out: the test checks what it is given.
const charts = vi.hoisted(() => ({ options: [] as unknown[], disposed: 0 }));
vi.mock('echarts', () => ({
  init: () => ({
    setOption: (option: unknown) => charts.options.push(option),
    resize: () => undefined,
    dispose: () => (charts.disposed += 1),
  }),
}));

// AG Grid needs a layout engine; the test drives the datasource the grid would call.
const grids = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    grids.props.push(props);
    return <div data-testid="ag-grid" />;
  },
}));

let runtime: FakeRuntime;
beforeEach(() => {
  charts.options = [];
  grids.props = [];
  runtime = fakeRuntime();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ref = (datasetId: string, rowCount?: number) => ({
  store: 'cache' as const,
  key: `k-${datasetId}`,
  datasetId,
  kind: 'rows' as const,
  columns: ['site', 'kwh'],
  ...(rowCount !== undefined ? { rowCount } : {}),
});

/** One fixture per content-part type (design Section 12.5). */
const fixtures: Record<ContentPart['type'], ContentPart> = {
  markdown: { type: 'markdown', text: '## Summary\n\n- **Plant A** uses the most\n- [Source](https://example.com/a)' },
  table: {
    type: 'table',
    title: 'Usage by site',
    columns: [
      { key: 'site', label: 'Site' },
      { key: 'kwh', label: 'kWh', type: 'number' },
    ],
    rows: [
      { site: 'Plant A', kwh: 1200 },
      { site: 'Plant B', kwh: 800 },
    ],
    datasetRef: ref('d-table', 340),
  },
  grid: { type: 'grid', title: 'All readings', columns: [{ field: 'site', headerName: 'Site', cellRenderer: 'evil' }], datasetRef: ref('d-grid'), pageSize: 25, features: { pageSizeOptions: [25, 50] } },
  chart: {
    type: 'chart',
    library: 'echarts',
    option: { title: { text: 'kWh by site' }, xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }] },
    datasetRef: ref('d-chart'),
  },
  card: {
    type: 'card',
    title: 'Plant A',
    body: 'Highest use this week.',
    fields: [{ label: 'kWh', value: 1200 }],
    actions: [{ label: 'Open site' }],
  },
  json: { type: 'json', value: { site: 'Plant A', readings: [1, 2, 3] } },
  file: { type: 'file', name: 'report.csv', mediaType: 'text/csv', downloadRef: '/v1/datasets/d-file' },
  html: { type: 'html', html: '<h1>Weekly report</h1><p>All good</p>', datasetRefs: [] },
  citation: { type: 'citation', title: 'Energy handbook', url: 'https://example.com/handbook', snippet: 'Peak demand is…' },
  error: { type: 'error', code: 'TOOL_FAILED', message: 'The database query failed.' },
  form: { type: 'form', interruptId: 'int-1', schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } },
};

describe('content-part renderers', () => {
  it('the registry has a renderer for every part type of the contract', () => {
    expect(Object.keys(renderers).sort()).toEqual(Object.keys(fixtures).sort());
  });

  it('[U-05] each renderer renders its fixture', async () => {
    runtime.on('GET /v1/datasets/{datasetId}', () =>
      json({ datasetId: 'd-chart', kind: 'rows', rows: [{ site: 'Plant A', kwh: 1200 }], total: 1, page: 1, pageSize: 100, columns: ['site', 'kwh'] }),
    );
    const { container } = renderApp(
      <MessageContent parts={Object.values(fixtures)} source={{ runId: 'run-1', sessionId: 's-1' }} />,
    );
    // markdown
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText('Plant A', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    // table: caption, headers, cells, preview note
    const table = screen.getByRole('table', { name: 'Usage by site' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Site', 'kWh']);
    expect(within(table).getByText('1,200')).toHaveClass('text-right');
    expect(screen.getByText('Showing 2 of 340 rows.')).toBeInTheDocument();
    // grid: AG Grid in server mode with allow-listed columns
    await screen.findByTestId('ag-grid');
    const grid = grids.props.at(-1)!;
    expect(grid.rowModelType).toBe('infinite');
    expect(grid.cacheBlockSize).toBe(25);
    expect(grid.paginationPageSizeSelector).toEqual([25, 50]);
    expect(grid.columnDefs).toEqual([expect.objectContaining({ field: 'site', headerName: 'Site', sortable: true })]);
    expect((grid.columnDefs as Record<string, unknown>[])[0]).not.toHaveProperty('cellRenderer');
    // chart: the option as data, with the dataset's rows as its source
    await waitFor(() => expect(charts.options.length).toBeGreaterThan(0));
    expect(charts.options.at(-1)).toMatchObject({ title: { text: 'kWh by site' }, dataset: { source: [{ site: 'Plant A', kwh: 1200 }] } });
    expect(screen.getByRole('img', { name: 'kWh by site' })).toBeInTheDocument();
    // card
    const card = screen.getByRole('heading', { name: 'Plant A' }).closest('article')!;
    expect(card).toHaveTextContent('Highest use this week.');
    expect(card).toHaveTextContent('kWh1,200');
    // json: collapsed, then expanded
    expect(screen.getByText('Object with 2 fields')).toBeInTheDocument();
    // file: through the same-origin proxy
    expect(screen.getByRole('link', { name: 'Download report.csv' })).toHaveAttribute('href', '/api/runtime/v1/datasets/d-file');
    // html: sandboxed iframe without any permission
    const frame = screen.getByTitle('Report view');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('Weekly report');
    expect(container.querySelector('h1')).toBeNull();
    // citation
    expect(screen.getByRole('link', { name: 'Energy handbook' })).toHaveAttribute('href', 'https://example.com/handbook');
    // error
    expect(screen.getByRole('note')).toHaveTextContent('The database query failed. (TOOL_FAILED)');
    // form: the interrupt's form
    expect(screen.getByRole('form', { name: 'Input needed' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('an unknown part type is shown as JSON, and unsafe links in citations are dropped', () => {
    renderApp(
      <MessageContent
        parts={[
          { type: 'hologram', data: 1 },
          { type: 'citation', title: 'Bad', url: 'javascript:alert(1)' },
        ]}
      />,
    );
    expect(screen.getByText('Object with 2 fields')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bad' })).toBeNull();
    expect(screen.getByText('Bad')).toBeInTheDocument();
  });
});

describe('grid server mode', () => {
  const request = (startRow: number, sortModel: GridRowsRequest['sortModel'] = [], filterModel = {}) => {
    const result: { rows?: unknown[]; last?: number; failed?: boolean } = {};
    return {
      result,
      request: {
        startRow,
        endRow: startRow + 25,
        sortModel,
        filterModel,
        successCallback: (rows: unknown[], last?: number) => Object.assign(result, { rows, last }),
        failCallback: () => (result.failed = true),
      },
    };
  };

  it('[U-06] each block is one page of /v1/datasets with the sort and text filters of the grid', async () => {
    runtime.on('GET /v1/datasets/{datasetId}', (call) =>
      json({
        datasetId: 'd-1',
        kind: 'rows',
        rows: [{ page: Number(call.query.get('page')) }],
        total: 120,
        page: Number(call.query.get('page')),
        pageSize: 25,
        columns: ['site'],
      }),
    );
    const source = datasetSource(createRuntimeApi(), 'd-1', 25, () => undefined);
    const first = request(0);
    await source.getRows(first.request);
    const third = request(50, [{ colId: 'kwh', sort: 'desc' }], { site: { filterType: 'text', type: 'contains', filter: 'Plant' } });
    await source.getRows(third.request);
    const ascending = request(25, [{ colId: 'site', sort: 'asc' }]);
    await source.getRows(ascending.request);

    const calls = runtime.calls('GET /v1/datasets/{datasetId}');
    expect(calls.map((call) => Object.fromEntries(call.query))).toEqual([
      { page: '1', pageSize: '25' },
      { page: '3', pageSize: '25', sort: 'kwh:desc', filter: '{"site":"Plant"}' },
      { page: '2', pageSize: '25', sort: 'site' },
    ]);
    expect(calls[0]!.path).toBe('/v1/datasets/d-1');
    expect(first.result).toEqual({ rows: [{ page: 1 }], last: 120 });
    expect(third.result).toEqual({ rows: [{ page: 3 }], last: 120 });
  });

  it('[U-06] a failed page fails the block and reports the error', async () => {
    runtime.on('GET /v1/datasets/{datasetId}', () => json({ error: { code: 'DATASET_NOT_FOUND', message: 'gone' } }, 404));
    const errors: unknown[] = [];
    const source = datasetSource(createRuntimeApi(), 'd-1', 25, (error) => errors.push(error));
    const page = request(0);
    await source.getRows(page.request);
    expect(page.result.failed).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('column definitions keep only data keys and fall back to the dataset columns', () => {
    expect(columnDefs([{ field: 'a', headerName: 'A', valueFormatter: 'code', width: 90 }], [], false)).toEqual([
      { sortable: true, field: 'a', headerName: 'A', width: 90 },
    ]);
    expect(columnDefs([], ['x', 'y'], true).map((def) => [def.field, def.filter])).toEqual([
      ['x', 'agTextColumnFilter'],
      ['y', 'agTextColumnFilter'],
    ]);
  });
});

describe('JSON viewer', () => {
  it('expands to show the whole value', async () => {
    renderApp(<MessageContent parts={[{ type: 'json', value: [1, 2] }]} />);
    await userEvent.setup().click(screen.getByText('List of 2 items'));
    expect(screen.getByText(/\[\s+1,\s+2\s+\]/)).toBeVisible();
  });
});
