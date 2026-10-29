'use client';

import { useRunStore } from '@/store/run';
import { InterruptForm, type InterruptRequest } from './InterruptForm';

export interface InterruptPanelProps {
  runId: string;
  sessionId: string;
  interrupt: InterruptRequest;
  autoFocus?: boolean;
}

/**
 * An interrupt form wired to the run store: the answer resumes the run in stream mode, and the
 * resumed turn streams into the same live run (for a reopened chat, a run attached as waiting).
 */
export function InterruptPanel({ runId, sessionId, interrupt, autoFocus }: InterruptPanelProps) {
  const answer = useRunStore((state) => state.answer);
  const attach = useRunStore((state) => state.attach);
  return (
    <InterruptForm
      interrupt={interrupt}
      autoFocus={autoFocus}
      onSubmit={(value) => answer(attach({ runId, sessionId, status: 'waiting' }), interrupt.interruptId, value)}
    />
  );
}
