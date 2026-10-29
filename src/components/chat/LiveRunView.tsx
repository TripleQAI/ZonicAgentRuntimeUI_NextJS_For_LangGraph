'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { MarkdownText } from '@/components/content/renderers/MarkdownRenderer';
import { PartView } from '@/components/content/MessageContent';
import { ContentContext } from '@/components/content/ContentContext';
import { InterruptPanel } from '@/components/interrupts/InterruptPanel';
import { t } from '@/lib/i18n/t';
import { stepsFromEvents } from '@/lib/timeline';
import type { LiveRun } from '@/store/run';
import { ErrorNotice } from './ErrorNotice';
import { RunSteps } from './RunSteps';

export interface LiveRunViewProps {
  run: LiveRun;
  /** Show the user's message: it is not saved yet (or not loaded yet). */
  showInput: boolean;
  /** Show the agent's side: its answer is not saved yet. */
  showAnswer: boolean;
  onRetry?: () => void;
}

/** What the chat's status region announces for a run (case U-12). */
export const announcement = (run: LiveRun): string => {
  if (run.stopped) return t('chat.stoppedStatus');
  switch (run.status) {
    case 'starting':
    case 'running':
      return run.connection === 'reconnecting' ? t('chat.reconnecting') : t('chat.responding');
    case 'waiting':
      return t('chat.waiting');
    case 'completed':
      return t('chat.done');
    case 'failed':
      return t('chat.failedStatus');
    case 'cancelled':
      return t('chat.stoppedStatus');
  }
};

/**
 * A run streaming in this tab (task U5-03): the text as it arrives, rendered as markdown in a polite
 * live region that is busy while the text grows (case U-12), the turn's content parts, its steps,
 * a pause's forms, and the outcome: an error with Retry, or "Stopped" over the text kept (U-03).
 */
export function LiveRunView({ run, showInput, showAnswer, onRetry }: LiveRunViewProps) {
  const steps = useMemo(() => stepsFromEvents(run.events), [run.events]);
  const streaming = run.status === 'starting' || run.status === 'running';
  const multiple = new Set(run.segments.map((segment) => `${segment.nodeId}:${segment.member ?? ''}`)).size > 1;
  return (
    <>
      {showInput && run.input && (
        <li className="flex justify-end">
          <article aria-label={t('chat.you')} className="max-w-[85%] rounded-xl rounded-br-sm bg-raised px-4 py-2.5 md:max-w-[75%]">
            <MarkdownText text={run.input} />
          </article>
        </li>
      )}
      {showAnswer && (
        <li className="flex justify-start" data-live-run={run.runId ?? run.key} data-status={run.status}>
          <article
            aria-label={t('chat.agent')}
            className="w-full min-w-0 px-1"
          >
            <div aria-live="polite" aria-busy={streaming} aria-atomic="false" data-testid="live-text">
              {run.segments.map((segment, index) => (
                <section key={index}>
                  {multiple && (segment.member ?? segment.nodeId) && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{segment.member ?? segment.nodeId}</p>
                  )}
                  <MarkdownText text={segment.text} />
                </section>
              ))}
              {streaming && run.segments.length === 0 && <p className="text-sm text-muted">{t('chat.thinking')}</p>}
            </div>
            <ContentContext.Provider value={{ ...(run.runId ? { runId: run.runId } : {}), sessionId: run.sessionId }}>
              {run.parts.map((part, index) => (
                <PartView key={index} part={part} />
              ))}
            </ContentContext.Provider>
            {run.stopped && (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted" data-testid="stopped">
                {t('chat.stopped')}
              </p>
            )}
            {run.connection === 'reconnecting' && streaming && (
              <p className="mt-2 text-sm text-muted">{t('chat.reconnecting')}</p>
            )}
            {run.gap && <p className="mt-2 text-sm text-muted">{t('chat.gap')}</p>}
            {run.error && <ErrorNotice error={run.error} onRetry={onRetry} />}
            {run.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-muted">
                {run.warnings.map((warning, index) => (
                  <li key={index}>{warning.message}</li>
                ))}
              </ul>
            )}
            {steps.length > 0 && (
              <details className="no-print mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-muted">
                  {t('steps.summary', { count: steps.length })}
                </summary>
                <div className="mt-2">
                  <RunSteps steps={steps} />
                </div>
              </details>
            )}
            {run.runId && !streaming && (
              <Link href={`/runs/${run.runId}`} className="btn-ghost no-print mt-1 inline-block">
                {t('actions.details')}
              </Link>
            )}
          </article>
        </li>
      )}
      {run.runId &&
        run.sessionId &&
        run.status === 'waiting' &&
        run.interrupts.map((interrupt, index) => (
          <li key={interrupt.interruptId}>
            <InterruptPanel runId={run.runId!} sessionId={run.sessionId!} interrupt={interrupt} autoFocus={index === 0} />
          </li>
        ))}
    </>
  );
}
