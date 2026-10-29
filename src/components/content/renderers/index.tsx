import { lazy, type ComponentType } from 'react';
import type { ContentPart, ContentPartType } from '@/lib/api/types';
import { CardRenderer } from './CardRenderer';
import { CitationRenderer } from './CitationRenderer';
import { ErrorRenderer } from './ErrorRenderer';
import { FileRenderer } from './FileRenderer';
import { FormRenderer } from './FormRenderer';
import { HtmlRenderer } from './HtmlRenderer';
import { JsonRenderer } from './JsonRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TableRenderer } from './TableRenderer';

/** The renderer of each part type: one entry per type of the contract. */
export type RendererRegistry = { [K in ContentPartType]: ComponentType<{ part: Extract<ContentPart, { type: K }> }> };

/**
 * The content-part renderer registry (Registry with Strategy, design Section 14.2; task U5-04). A
 * new part type is a new entry; the mapped type makes a missing renderer a type error. The grid
 * (AG Grid) and chart (ECharts) load only when a message has one.
 */
export const renderers: RendererRegistry = {
  markdown: MarkdownRenderer,
  table: TableRenderer,
  grid: lazy(() => import('./GridRenderer')),
  chart: lazy(() => import('./ChartRenderer')),
  card: CardRenderer,
  json: JsonRenderer,
  file: FileRenderer,
  html: HtmlRenderer,
  citation: CitationRenderer,
  error: ErrorRenderer,
  form: FormRenderer,
};
