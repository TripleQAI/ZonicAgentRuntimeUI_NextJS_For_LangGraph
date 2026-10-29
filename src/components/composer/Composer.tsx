'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import { useDrafts } from '@/store/drafts';

export interface ComposerProps {
  /** Where the unsent text is kept: a session ID or `new:<workflow>` (case U-11). */
  draftKey: string;
  /** Sends the text; resolves true once the runtime accepted it, false to keep the text. */
  onSend(text: string): Promise<boolean>;
  /** A run is streaming: Stop replaces Send (case U-03). */
  running?: boolean;
  stopping?: boolean;
  onStop?(): void;
  disabled?: boolean;
  placeholder?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * The message composer (task U5-01): multi-line, Enter sends and Shift+Enter starts a new line, the
 * text survives a failed send, a sign-in and a reload (drafts in session storage), and Stop cancels
 * the running turn. The attachments control stays hidden until its feature flag is on.
 */
export function Composer({ draftKey, onSend, running, stopping, onStop, disabled, placeholder, ref }: ComposerProps) {
  const setDraft = useDrafts((state) => state.setDraft);
  const clearDraft = useDrafts((state) => state.clearDraft);
  // Drafts load after mount: the server render has none, so the first client render must not either.
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const loaded = useRef<string | undefined>(undefined);
  const id = useId();

  useEffect(() => {
    if (loaded.current === draftKey) return;
    loaded.current = draftKey;
    setText(useDrafts.getState().drafts[draftKey] ?? '');
  }, [draftKey]);

  const change = (value: string) => {
    setText(value);
    setDraft(draftKey, value);
  };

  const send = async () => {
    const value = text.trim();
    if (!value || sending || running || disabled) return;
    setSending(true);
    const accepted = await onSend(value);
    setSending(false);
    if (accepted) {
      setText('');
      clearDraft(draftKey);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <form onSubmit={submit} className="no-print sticky bottom-0 bg-page px-3 pb-3 pt-2 md:px-6 md:pb-5">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-line bg-surface p-2 shadow-md transition-colors duration-150 focus-within:border-accent">
        <label htmlFor={`${id}-text`} className="sr-only">
          {t('composer.label')}
        </label>
        {publicConfig.features.attachments && (
          <button type="button" className="btn-ghost self-center" aria-label={t('composer.attach')} disabled>
            +
          </button>
        )}
        <textarea
          id={`${id}-text`}
          ref={ref}
          value={text}
          onChange={(event) => change(event.target.value)}
          onKeyDown={keyDown}
          rows={Math.min(8, Math.max(1, text.split('\n').length))}
          placeholder={placeholder ?? t('composer.placeholder')}
          aria-describedby={`${id}-hint`}
          disabled={disabled}
          className="max-h-60 min-h-[44px] flex-1 resize-none rounded-md bg-transparent px-3 py-2.5 text-base placeholder:text-muted disabled:cursor-not-allowed"
        />
        {running ? (
          <button type="button" onClick={onStop} disabled={stopping} className="btn-secondary">
            {stopping ? t('composer.stopping') : t('composer.stop')}
          </button>
        ) : (
          <button type="submit" disabled={sending || disabled || text.trim() === ''} className="btn-primary">
            {t('composer.send')}
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted">
        {t('composer.hint')}
      </p>
    </form>
  );
}
