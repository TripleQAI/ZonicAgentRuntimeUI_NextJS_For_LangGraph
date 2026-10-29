'use client';

import type { AgentCard } from '@/lib/api/runtime';
import { t } from '@/lib/i18n/t';

export interface AgentCatalogProps {
  agents: readonly AgentCard[];
  selected?: string;
  onSelect(agent: AgentCard): void;
}

/** The agent picker of a new chat (task U5-01): one chip per workflow the caller may run. */
export function AgentCatalog({ agents, selected, onSelect }: AgentCatalogProps) {
  if (agents.length === 0) return <p className="text-base text-muted">{t('catalog.empty')}</p>;
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label={t('catalog.title')}>
      {agents.map((agent) => {
        const active = agent.agenticWorkflowId === selected;
        return (
          <li key={agent.agenticWorkflowId}>
            <button
              type="button"
              onClick={() => onSelect(agent)}
              aria-pressed={active}
              title={agent.description || undefined}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
                active ? 'border-primary bg-raised text-text shadow-glow' : 'border-line bg-surface text-muted hover:border-accent hover:text-text'
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary' : 'bg-line'}`} />
              <span>{agent.displayName || agent.name}</span>
              {agent.bpc && <span className="text-xs font-semibold uppercase tracking-wide text-muted">{agent.bpc}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
