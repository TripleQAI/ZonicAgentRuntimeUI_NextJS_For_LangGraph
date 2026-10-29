'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '@/components/chat/ErrorNotice';
import { Composer } from '@/components/composer/Composer';
import { runtimeApi, type AgentCard } from '@/lib/api/runtime';
import { t } from '@/lib/i18n/t';
import { useRunStore, type RunErrorInfo } from '@/store/run';
import { AgentCatalog } from './AgentCatalog';

/**
 * The home page body (task U5-01, case U-01): a new chat. The composer is ready at once for the
 * preselected agent (`?agent=<id>`, else the first in the catalog), and the chips above it switch
 * agents. Sending starts a run with that workflow and no session; the runtime creates the session,
 * and the chat page takes over once `run.started` names it.
 */
export function NewChat({ initialAgentId }: { initialAgentId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => runtimeApi.listAgents() });
  const [selected, setSelected] = useState<string | undefined>(initialAgentId);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<{ text: string; error: RunErrorInfo }>();
  const send = useRunStore((state) => state.send);
  const dismiss = useRunStore((state) => state.dismiss);
  const sessionId = useRunStore((state) => (pending ? state.runs[pending]?.sessionId : undefined));
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    router.push(`/chat/${sessionId}`);
  }, [sessionId, router, queryClient]);

  const items = agents.data?.items ?? [];
  const agent = items.find((item) => item.agenticWorkflowId === selected) ?? items[0];

  const choose = (item: AgentCard) => {
    setSelected(item.agenticWorkflowId);
    setError(undefined);
    requestAnimationFrame(() => composer.current?.focus());
  };

  const sendText = async (text: string): Promise<boolean> => {
    if (!agent) return false;
    setError(undefined);
    const result = await send({ agenticWorkflowId: agent.agenticWorkflowId, text });
    if (result.error) {
      dismiss(result.key);
      setError({ text, error: result.error });
      return false;
    }
    setPending(result.key);
    return true;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 md:px-6">
        <div className="w-full max-w-3xl text-center">
          <h1 className="text-xl font-light tracking-tight md:text-2xl">{t('home.title')}</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">{t('home.lead')}</p>
          <div className="mt-8">
            {agents.isPending && <p className="text-sm text-muted">{t('catalog.loading')}</p>}
            {agents.isError && <ErrorNotice error={agents.error} onRetry={() => void agents.refetch()} />}
            {agents.data && (
              <AgentCatalog agents={agents.data.items} selected={agent?.agenticWorkflowId} onSelect={choose} />
            )}
          </div>
          {agent?.description && <p className="mx-auto mt-4 max-w-xl text-sm text-muted">{agent.description}</p>}
          <div className="text-left">
            {error && <ErrorNotice error={error.error} onRetry={() => void sendText(error.text)} />}
          </div>
          {pending && !error && <p role="status" className="mt-4 text-sm text-muted">{t('catalog.starting')}</p>}
        </div>
      </section>
      {agent && (
        <Composer
          ref={composer}
          draftKey={`new:${agent.agenticWorkflowId}`}
          onSend={sendText}
          disabled={Boolean(pending)}
          placeholder={t('composer.placeholderAgent', { name: agent.displayName || agent.name })}
        />
      )}
    </div>
  );
}
