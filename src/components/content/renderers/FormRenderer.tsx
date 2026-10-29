'use client';

import { useContext } from 'react';
import { InterruptPanel } from '@/components/interrupts/InterruptPanel';
import type { FormPart } from '@/lib/api/generated/models';
import { ContentContext } from '../ContentContext';

/** A `form` part: the interrupt it names, answered like any interrupt of the message's run. */
export function FormRenderer({ part }: { part: FormPart }) {
  const { runId, sessionId, answered } = useContext(ContentContext);
  if (!runId || !sessionId || answered) return null;
  return (
    <InterruptPanel
      runId={runId}
      sessionId={sessionId}
      interrupt={{ interruptId: part.interruptId, kind: 'form', schema: part.schema ?? {} }}
    />
  );
}
