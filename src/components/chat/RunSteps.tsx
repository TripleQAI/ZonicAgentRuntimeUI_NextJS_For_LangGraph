import { t } from '@/lib/i18n/t';
import type { Step } from '@/lib/timeline';

const duration = (ms?: number) => (ms === undefined ? '' : t('steps.duration', { seconds: (ms / 1000).toFixed(1) }));

const statusLabel = (status: string) =>
  status === 'running'
    ? t('steps.running')
    : status === 'failed' || status === 'error'
      ? t('steps.failed')
      : t('steps.done');

/** What one step says: the node, tool or swarm member, and its outcome. */
function describe(step: Step): string {
  switch (step.kind) {
    case 'node':
      return t('steps.node', { name: step.name, type: step.nodeType });
    case 'tool':
      return step.member
        ? t('steps.memberTool', { name: step.name, member: step.member })
        : t('steps.tool', { name: step.name });
    case 'member':
      return t('steps.member', { member: step.member });
    case 'handoff':
      return t('steps.handoff', { from: step.from, to: step.to.join(', ') });
    case 'loop':
      return t('steps.loop', { iteration: step.iteration });
    case 'interrupt':
      return t('steps.interrupt');
    case 'warning':
      return t('steps.warning', { message: step.message });
  }
}

const indent = (step: Step) => (step.kind === 'tool' || step.kind === 'member' || step.kind === 'handoff' ? 'pl-6' : '');

/**
 * A run's steps in order (task U5-07, case U-08): node visits with status and duration, tool calls,
 * swarm members and handoffs with member names, loop iterations, pauses and warnings.
 */
export function RunSteps({ steps }: { steps: readonly Step[] }) {
  if (steps.length === 0) return <p className="text-sm text-muted">{t('steps.none')}</p>;
  return (
    <ol className="space-y-1 text-sm" aria-label={t('steps.title')}>
      {steps.map((step) => (
        <li key={step.id} className={`flex flex-wrap items-baseline gap-x-2 ${indent(step)}`} data-step={step.kind}>
          <span className="font-semibold">{describe(step)}</span>
          {'status' in step && <span className="text-xs text-muted">{statusLabel(step.status)}</span>}
          {'durationMs' in step && step.durationMs !== undefined && (
            <span className="tabular text-xs text-muted">{duration(step.durationMs)}</span>
          )}
          {step.kind === 'handoff' && step.message && <span className="w-full text-xs text-muted">{step.message}</span>}
        </li>
      ))}
    </ol>
  );
}
