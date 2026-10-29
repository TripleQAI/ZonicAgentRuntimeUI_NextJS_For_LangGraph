'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { runtimeApi, type Message } from '@/lib/api/runtime';
import { asContentPart } from '@/lib/api/types';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import { useRunStore } from '@/store/run';
import { ErrorNotice } from './ErrorNotice';

/** The text a copy puts on the clipboard: the message's markdown, else its preview. */
export function copyText(message: Pick<Message, 'contentParts' | 'textPreview'>): string {
  const texts = message.contentParts
    .map(asContentPart)
    .flatMap((part) => (part.type === 'markdown' ? [part.text] : []));
  return texts.length > 0 ? texts.join('\n\n') : message.textPreview;
}

/** Ratings the runtime stores for "helpful" and "not helpful" (`FeedbackRequest.rating`, -1 to 5). */
const HELPFUL = 1;
const NOT_HELPFUL = -1;

/**
 * Actions on an answer (task U5-08, case U-13): copy to the clipboard, feedback through
 * `POST /v1/messages/{id}/feedback` (a rating, then an optional comment), and the run's details.
 */
export function MessageActions({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<number | undefined>(message.feedbackRating ?? undefined);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>();
  const id = useId();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), publicConfig.copiedNoticeMs);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(message));
      setCopied(true);
    } catch {
      setError({ code: 'COPY_FAILED', message: t('actions.copyFailed'), retryable: false });
    }
  };

  const rate = async (value: number, withComment?: string) => {
    setError(undefined);
    try {
      await runtimeApi.feedback(message.messageId, { rating: value, ...(withComment ? { comment: withComment } : {}) });
      setRating(value);
      if (withComment) {
        setSent(true);
        setCommenting(false);
      } else setCommenting(true);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) useRunStore.setState({ authExpired: true });
      setError(failure);
    }
  };

  return (
    <div className="no-print mt-2">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('actions.label')}>
        <button type="button" className="btn-ghost" onClick={() => void copy()}>
          {copied ? t('actions.copied') : t('actions.copy')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          aria-pressed={rating === HELPFUL}
          onClick={() => void rate(HELPFUL)}
        >
          {t('actions.helpful')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          aria-pressed={rating === NOT_HELPFUL}
          onClick={() => void rate(NOT_HELPFUL)}
        >
          {t('actions.notHelpful')}
        </button>
        {message.runId && (
          <Link href={`/runs/${message.runId}`} className="btn-ghost">
            {t('actions.details')}
          </Link>
        )}
        {copied && (
          <span role="status" className="sr-only">
            {t('actions.copied')}
          </span>
        )}
      </div>
      {commenting && rating !== undefined && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void rate(rating, comment.trim() || undefined);
          }}
        >
          <label htmlFor={`${id}-comment`} className="w-full text-sm font-semibold">
            {t('actions.comment')}
          </label>
          <input
            id={`${id}-comment`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            className="field flex-1"
          />
          <button type="submit" className="btn-secondary" disabled={comment.trim() === ''}>
            {t('actions.sendComment')}
          </button>
        </form>
      )}
      {sent && (
        <p role="status" className="mt-1 text-sm text-muted">
          {t('actions.thanks')}
        </p>
      )}
      {error !== undefined && <ErrorNotice error={error} />}
    </div>
  );
}
