import { createContext } from 'react';

/** Where a message's parts come from, for parts that act on their run (a `form` answers it). */
export interface ContentSource {
  runId?: string;
  sessionId?: string;
  /** The run no longer waits, so its forms are history. */
  answered?: boolean;
}

export const ContentContext = createContext<ContentSource>({});
