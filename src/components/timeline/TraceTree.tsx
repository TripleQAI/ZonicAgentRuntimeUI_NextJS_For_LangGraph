import type { TraceObservation } from '@/lib/api/runtime';
import { t } from '@/lib/i18n/t';

/** The trace's observation tree (spans, generations, events) with latency, model, tokens and cost. */
export function TraceTree({ observations }: { observations: readonly TraceObservation[] }) {
  if (observations.length === 0) return <p className="text-sm text-muted">{t('trace.empty')}</p>;
  return (
    <ul className="mt-2 space-y-1 text-sm" aria-label={t('trace.title')}>
      {observations.map((observation) => (
        <Observation key={observation.observationId} observation={observation} />
      ))}
    </ul>
  );
}

function Observation({ observation }: { observation: TraceObservation }) {
  const facts = [
    observation.type,
    observation.latencyMs != null ? t('steps.duration', { seconds: (observation.latencyMs / 1000).toFixed(2) }) : '',
    observation.model ?? '',
    observation.totalCost != null ? t('run.costValue', { cost: observation.totalCost.toFixed(4) }) : '',
    observation.level !== 'DEFAULT' ? observation.level : '',
  ].filter(Boolean);
  const label = (
    <span>
      <span className="font-semibold">{observation.name}</span>{' '}
      <span className="text-xs text-muted">{facts.join(' · ')}</span>
      {observation.statusMessage && <span className="block text-xs text-danger">{observation.statusMessage}</span>}
    </span>
  );
  if (observation.children.length === 0)
    return (
      <li className="pl-4">
        {label}
      </li>
    );
  return (
    <li>
      <details open>
        <summary className="cursor-pointer">{label}</summary>
        <ul className="ml-4 space-y-1 border-l border-line pl-2">
          {observation.children.map((child) => (
            <Observation key={child.observationId} observation={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}
