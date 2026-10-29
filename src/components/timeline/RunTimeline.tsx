'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ErrorNotice } from '@/components/chat/ErrorNotice';
import { RunSteps } from '@/components/chat/RunSteps';
import { ApiError } from '@/lib/api/client';
import { runtimeApi } from '@/lib/api/runtime';
import { TERMINAL_STATUSES, type TypedRunEvent } from '@/lib/api/types';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import { RunStream } from '@/lib/stream/run-stream';
import { stepsFromEvents, stepsFromVisits, TIMELINE_EVENTS } from '@/lib/timeline';
import { TraceTree } from './TraceTree';

const number = (value: number) => value.toLocaleString();

/**
 * A run's page (task U5-07, case U-08): status, usage and cost; the timeline of node, tool and swarm
 * steps from the run's events while its replay buffer lasts (handoffs with member names), else from
 * its saved node timeline; each node visit's input and output for permitted roles; and the trace
 * tree from `agent_observability`, which the runtime shows to trace roles only.
 */
export function RunTimeline({ runId }: { runId: string }) {
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => runtimeApi.getRun(runId),
    refetchInterval: (query) =>
      query.state.data && !TERMINAL_STATUSES.has(query.state.data.status) ? publicConfig.stream.reconnectDelayMs * 8 : false,
  });
  const nodes = useQuery({ queryKey: ['run', runId, 'nodes'], queryFn: () => runtimeApi.runNodes(runId) });
  const trace = useQuery({ queryKey: ['run', runId, 'trace'], queryFn: () => runtimeApi.runTrace(runId) });
  const [events, setEvents] = useState<TypedRunEvent[]>([]);
  const [gap, setGap] = useState(false);

  // The run's events from the start of its replay buffer, then live while it runs.
  useEffect(() => {
    const stream = new RunStream(
      runtimeApi,
      publicConfig.stream,
      {
        onEvent: (event) => {
          if (event.type === 'stream.gap') {
            setGap(true);
            stream.close();
          } else if (TIMELINE_EVENTS.has(event.type)) setEvents((current) => [...current, event]);
        },
      },
      { runId },
    );
    void stream.attach();
    return () => stream.close();
  }, [runId]);

  const steps = useMemo(() => {
    const fromEvents = stepsFromEvents(events);
    return fromEvents.length > 0 && !gap ? fromEvents : stepsFromVisits(nodes.data?.items ?? []);
  }, [events, gap, nodes.data]);

  const traceHidden = trace.error instanceof ApiError && (trace.error.status === 403 || trace.error.status === 404);
  const usage = run.data?.usage;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <h1 className="text-xl font-semibold">{t('run.title')}</h1>
      {run.isError && <ErrorNotice error={run.error} onRetry={() => void run.refetch()} />}
      {run.data && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="font-semibold text-muted">{t('run.status')}</dt>
            <dd data-testid="run-status">{run.data.status}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted">{t('run.tokens')}</dt>
            <dd className="tabular">
              {usage ? t('run.tokenCounts', { input: number(usage.inputTokens), output: number(usage.outputTokens) }) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-muted">{t('run.cost')}</dt>
            <dd className="tabular">{trace.data ? t('run.costValue', { cost: trace.data.totalCost.toFixed(4) }) : '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted">{t('run.session')}</dt>
            <dd>
              <Link href={`/chat/${run.data.sessionId}`} className="link">
                {t('run.openChat')}
              </Link>
            </dd>
          </div>
        </dl>
      )}
      {run.data?.error && <ErrorNotice error={run.data.error} />}

      <h2 className="mt-8 text-lg font-semibold">{t('steps.title')}</h2>
      <div className="mt-3 rounded-md border border-line bg-page p-4">
        <RunSteps steps={steps} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">{t('trace.title')}</h2>
      {trace.isPending && <p className="mt-2 text-sm text-muted">{t('trace.loading')}</p>}
      {traceHidden && <p className="mt-2 text-sm text-muted">{t('trace.unavailable')}</p>}
      {trace.isError && !traceHidden && <ErrorNotice error={trace.error} onRetry={() => void trace.refetch()} />}
      {trace.data && (
        <div className="mt-3">
          <p className="text-sm text-muted">
            {t('trace.summary', {
              observations: trace.data.observationCount,
              errors: trace.data.errorCount,
              input: number(trace.data.inputTokens),
              output: number(trace.data.outputTokens),
            })}
          </p>
          <TraceTree observations={trace.data.observations} />
        </div>
      )}
    </section>
  );
}
