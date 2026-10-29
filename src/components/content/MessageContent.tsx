'use client';

import { Suspense, type ComponentType } from 'react';
import { asContentPart, type ContentPart } from '@/lib/api/types';
import { t } from '@/lib/i18n/t';
import { ContentContext, type ContentSource } from './ContentContext';
import { renderers } from './renderers';

/** One part through the registry; an unknown type was already turned into JSON by `asContentPart`. */
export function PartView({ part }: { part: ContentPart }) {
  const Renderer = renderers[part.type] as ComponentType<{ part: ContentPart }>;
  return (
    <Suspense fallback={<p className="text-sm text-muted">{t('content.loading')}</p>}>
      <Renderer part={part} />
    </Suspense>
  );
}

/** A message's parts in order (the Composite of design Section 14.2). */
export function MessageContent({ parts, source = {} }: { parts: readonly unknown[]; source?: ContentSource }) {
  return (
    <ContentContext.Provider value={source}>
      {parts.map((part, index) => (
        <PartView key={index} part={asContentPart(part)} />
      ))}
    </ContentContext.Provider>
  );
}
