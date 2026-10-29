'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Composer } from '@/components/composer/Composer';
import { InterruptPanel } from '@/components/interrupts/InterruptPanel';
import { runtimeApi, type Message } from '@/lib/api/runtime';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import { selectSessionRuns, useRunStore, type LiveRun, type RunErrorInfo } from '@/store/run';
import { ErrorNotice } from './ErrorNotice';
import { announcement, LiveRunView } from './LiveRunView';
import { MessageBubble } from './MessageBubble';

const ACTIVE = new Set(['queued', 'running']);

/** Saved messages oldest first, each once (pages overlap when new messages arrive). */
export function orderedMessages(pages: readonly { items: Message[] }[]): Message[] {
  const byId = new Map<string, Message>();
  for (const page of pages) for (const message of page.items) byId.set(message.messageId, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * Which parts of a live run the chat still shows: its input until the saved user message of the run
 * has loaded, and its answer until the saved answer has (while it streams, always).
 */
export function liveVisibility(run: LiveRun, saved: readonly Message[]) {
  const ofRun = run.runId ? saved.filter((message) => message.runId === run.runId) : [];
  const streaming = run.status === 'starting' || run.status === 'running';
  return {
    showInput: !ofRun.some((message) => message.role === 'user'),
    showAnswer: streaming || run.stopped || run.error !== undefined || !ofRun.some((message) => message.role !== 'user'),
  };
}

/** The conversation of a session (task U5-03): saved messages, live runs, pending forms and the composer. */
export function ChatView({ sessionId }: { sessionId: string }) {
  const session = useQuery({ queryKey: ['session', sessionId], queryFn: () => runtimeApi.getSession(sessionId) });
  const messages = useInfiniteQuery({
    queryKey: ['messages', sessionId],
    queryFn: ({ pageParam }) =>
      runtimeApi.listMessages(sessionId, { limit: publicConfig.paging.messages, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const saved = useMemo(() => orderedMessages(messages.data?.pages ?? []), [messages.data]);
  const live = useRunStore(useShallow(selectSessionRuns(sessionId)));
  const { send, stop, attach, dismiss } = useRunStore(
    useShallow((state) => ({ send: state.send, stop: state.stop, attach: state.attach, dismiss: state.dismiss })),
  );
  const [sendError, setSendError] = useState<{ text: string; error: RunErrorInfo }>();
  const composer = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // A reopened chat whose last run is still going (or waiting) follows it.
  const latestRunId = useMemo(() => [...saved].reverse().find((message) => message.runId)?.runId, [saved]);
  const followed = live.some((run) => run.runId === latestRunId);
  const latestRun = useQuery({
    queryKey: ['run', latestRunId],
    queryFn: () => runtimeApi.getRun(latestRunId!),
    enabled: Boolean(latestRunId) && !followed,
  });
  useEffect(() => {
    const run = latestRun.data;
    if (!run || followed) return;
    if (ACTIVE.has(run.status)) attach({ runId: run.runId, sessionId, status: 'running' });
    else if (run.status === 'waiting_input') attach({ runId: run.runId, sessionId, status: 'waiting' });
  }, [latestRun.data, followed, attach, sessionId]);

  const active = live.find((run) => run.status === 'starting' || run.status === 'running');
  const waiting = live.find((run) => run.status === 'waiting');
  // A run attached as waiting has no interrupts from events: read them.
  const interrupts = useQuery({
    queryKey: ['interrupts', waiting?.runId],
    queryFn: () => runtimeApi.listInterrupts(waiting!.runId!),
    enabled: Boolean(waiting?.runId) && waiting!.interrupts.length === 0,
  });

  // Back to the composer once a pause's form is answered and the run goes on.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (wasWaiting.current && !waiting) composer.current?.focus();
    wasWaiting.current = Boolean(waiting);
  }, [waiting]);

  const lastText = live.at(-1)?.segments.at(-1)?.text.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [saved.length, live.length, lastText]);

  const sendText = async (text: string): Promise<boolean> => {
    setSendError(undefined);
    const { key, error } = await send({ sessionId, text });
    if (!error) return true;
    dismiss(key);
    setSendError({ text, error });
    return false;
  };

  const latestLive = live.at(-1);
  const title = session.data?.title || t('chat.untitled');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 md:px-6">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <div className="no-print flex items-center gap-2">
          {session.data?.status === 'archived' && (
            <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-muted">{t('sidebar.archivedBadge')}</span>
          )}
          <button type="button" className="btn-ghost" onClick={() => window.print()}>
            {t('actions.export')}
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
        {session.isError && <ErrorNotice error={session.error} onRetry={() => void session.refetch()} />}
        {messages.isError && <ErrorNotice error={messages.error} onRetry={() => void messages.refetch()} />}
        {messages.hasNextPage && (
          <div className="no-print mb-3 text-center">
            <button
              type="button"
              className="btn-secondary"
              disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              {t('chat.loadEarlier')}
            </button>
          </div>
        )}
        {messages.isPending && <p className="text-sm text-muted">{t('chat.loading')}</p>}
        <ol className="space-y-6" aria-label={t('chat.messages')}>
          {saved.map((message) => (
            <MessageBubble key={message.messageId} message={message} waitingRunId={waiting?.runId} />
          ))}
          {live.map((run) => (
            <LiveRunView
              key={run.key}
              run={run}
              {...liveVisibility(run, saved)}
              onRetry={() => {
                dismiss(run.key);
                if (run.input) void sendText(run.input);
              }}
            />
          ))}
          {waiting?.runId &&
            waiting.interrupts.length === 0 &&
            interrupts.data?.items.map((item, index) => (
              <li key={item.interruptId}>
                <InterruptPanel
                  runId={item.runId}
                  sessionId={sessionId}
                  autoFocus={index === 0}
                  interrupt={{
                    interruptId: item.interruptId,
                    kind: item.kind,
                    schema: item.answerSchema,
                    ...(typeof item.prompt.text === 'string' ? { prompt: item.prompt.text } : {}),
                    ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
                  }}
                />
              </li>
            ))}
        </ol>
        {sendError && <ErrorNotice error={sendError.error} onRetry={() => void sendText(sendError.text)} />}
        <div ref={end} />
        </div>
      </div>
      <p role="status" className="sr-only" data-testid="chat-status">
        {latestLive ? announcement(latestLive) : ''}
      </p>
      <Composer
        ref={composer}
        draftKey={sessionId}
        onSend={sendText}
        running={Boolean(active)}
        stopping={active?.stopping}
        onStop={() => active && void stop(active.key)}
        disabled={Boolean(waiting)}
        placeholder={waiting ? t('composer.waiting') : undefined}
      />
    </div>
  );
}
