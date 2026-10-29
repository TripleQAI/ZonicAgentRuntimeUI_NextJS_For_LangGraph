'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ChartPart } from '@/lib/api/generated/models';
import { runtimeApi } from '@/lib/api/runtime';
import { chartOption } from '@/lib/chart';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';

/**
 * An ECharts chart (design Section 12.5). The option is data the runtime checked against its key
 * allow list; `chartOption` drops anything that is not plain data again and fills `dataset` from
 * the part's dataset when the option has no data of its own. ECharts loads only when a chart shows.
 */
export default function ChartRenderer({ part }: { part: ChartPart }) {
  const element = useRef<HTMLDivElement>(null);
  const datasetId = part.datasetRef?.datasetId;
  const rows = useQuery({
    queryKey: ['dataset', datasetId, 'chart'],
    queryFn: () => runtimeApi.datasetPage(datasetId!, { page: 1, pageSize: publicConfig.paging.chartRows }),
    enabled: Boolean(datasetId),
  });
  const option = chartOption(part.option ?? {}, rows.data?.rows);
  const title = typeof (option.title as { text?: unknown } | undefined)?.text === 'string'
    ? String((option.title as { text: string }).text)
    : t('content.chart');

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    let disposed = false;
    let chart: { setOption(option: object): void; resize(): void; dispose(): void } | undefined;
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => chart?.resize());
    void import('echarts').then((echarts) => {
      if (disposed) return;
      // ECharts' dark theme for the dark page; the chart sits on the message, not on its own panel.
      chart = echarts.init(target, 'dark', { renderer: 'svg' });
      chart.setOption({ backgroundColor: 'transparent', ...option });
      observer?.observe(target);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [option]);

  return (
    <figure className="my-3">
      <div ref={element} role="img" aria-label={title} style={{ height: publicConfig.chartHeightPx }} />
    </figure>
  );
}
