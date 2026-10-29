'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ErrorNotice } from '@/components/chat/ErrorNotice';
import { runtimeApi, type Session } from '@/lib/api/runtime';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';

type Status = 'active' | 'archived';

/** A chat's Rename and Archive show on hover or keyboard focus on wide screens (always on touch). */
const hideUntilHover = 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100';

/** The search text after the user stops typing for `searchDebounceMs`. */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * The session list (task U5-05, case U-09): the caller's sessions newest first with cursor paging,
 * title search, rename and archive (and restore from the archived list). It sits in the shell's
 * sidebar, which is a drawer on narrow screens.
 */
export function SessionSidebar() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const q = useDebounced(search.trim(), publicConfig.searchDebounceMs);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const id = useId();
  const sessions = useInfiniteQuery({
    queryKey: ['sessions', status, q],
    queryFn: ({ pageParam }) =>
      runtimeApi.listSessions({
        limit: publicConfig.paging.sessions,
        status,
        ...(q ? { q } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const update = useMutation({
    mutationFn: ({ sessionId, change }: { sessionId: string; change: { title?: string; status?: Status } }) =>
      runtimeApi.updateSession(sessionId, change),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.setQueryData(['session', session.sessionId], session);
    },
  });
  const items = sessions.data?.pages.flatMap((page) => page.items) ?? [];

  const move = (session: Session, to: Status) => {
    update.mutate(
      { sessionId: session.sessionId, change: { status: to } },
      {
        onSuccess: () => {
          if (to === 'archived' && pathname === `/chat/${session.sessionId}`) router.push('/');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Link href="/" className="btn-primary mx-2 text-center">
        {t('sidebar.newChat')}
      </Link>
      <div className="px-2">
        <label htmlFor={`${id}-search`} className="sr-only">
          {t('sidebar.search')}
        </label>
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('sidebar.search')}
          className="field text-sm"
        />
      </div>
      <div className="flex gap-1 px-2" role="group" aria-label={t('sidebar.filter')}>
        {(['active', 'archived'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`btn-ghost flex-1 ${status === value ? 'bg-surface text-text' : ''}`}
          >
            {value === 'active' ? t('sidebar.active') : t('sidebar.archived')}
          </button>
        ))}
      </div>
      {sessions.isError && <ErrorNotice error={sessions.error} onRetry={() => void sessions.refetch()} />}
      {update.isError && <ErrorNotice error={update.error} />}
      {sessions.isPending ? (
        <p className="px-2 text-sm text-muted">{t('sidebar.loading')}</p>
      ) : items.length === 0 ? (
        <p className="px-2 text-sm text-muted">{q ? t('sidebar.noMatch') : t('sidebar.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label={t('sidebar.title')}>
          {items.map((session) => (
            <SessionItem
              key={session.sessionId}
              session={session}
              current={pathname === `/chat/${session.sessionId}`}
              onRename={(title) => update.mutateAsync({ sessionId: session.sessionId, change: { title } })}
              onMove={(to) => move(session, to)}
            />
          ))}
        </ul>
      )}
      {sessions.hasNextPage && (
        <button
          type="button"
          className="btn-secondary mx-2 text-sm"
          disabled={sessions.isFetchingNextPage}
          onClick={() => void sessions.fetchNextPage()}
        >
          {t('sidebar.more')}
        </button>
      )}
    </div>
  );
}

function SessionItem({
  session,
  current,
  onRename,
  onMove,
}: {
  session: Session;
  current: boolean;
  onRename(title: string): Promise<unknown>;
  onMove(to: Status): void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const input = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const name = session.title || t('chat.untitled');

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const finish = (focusBack = true) => {
    setEditing(false);
    if (focusBack) requestAnimationFrame(() => renameButton.current?.focus());
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (value && value !== session.title) {
      try {
        await onRename(value);
      } catch {
        // The sidebar shows the mutation's error.
      }
    }
    finish();
  };

  if (editing)
    return (
      <li>
        <form onSubmit={save} className="flex items-center gap-1 px-2">
          <label htmlFor={`${id}-title`} className="sr-only">
            {t('sidebar.renameLabel')}
          </label>
          <input
            id={`${id}-title`}
            ref={input}
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTitle(session.title);
                finish();
              }
            }}
            className="field py-1 text-sm"
          />
          <button type="submit" className="btn-ghost">
            {t('sidebar.save')}
          </button>
        </form>
      </li>
    );

  return (
    <li className={`group flex items-center gap-1 rounded-md px-2 ${current ? 'bg-raised text-text' : 'text-muted hover:bg-raised hover:text-text'}`}>
      <Link
        href={`/chat/${session.sessionId}`}
        aria-current={current ? 'page' : undefined}
        className="min-w-0 flex-1 truncate py-2 text-sm font-semibold"
      >
        {name}
      </Link>
      <button
        ref={renameButton}
        type="button"
        className={`btn-ghost text-xs ${current ? '' : hideUntilHover}`}
        aria-label={t('sidebar.rename', { title: name })}
        onClick={() => {
          setTitle(session.title);
          setEditing(true);
        }}
      >
        {t('sidebar.renameShort')}
      </button>
      <button
        type="button"
        className={`btn-ghost text-xs ${current ? '' : hideUntilHover}`}
        aria-label={
          session.status === 'archived' ? t('sidebar.restore', { title: name }) : t('sidebar.archive', { title: name })
        }
        onClick={() => onMove(session.status === 'archived' ? 'active' : 'archived')}
      >
        {session.status === 'archived' ? t('sidebar.restoreShort') : t('sidebar.archiveShort')}
      </button>
    </li>
  );
}
