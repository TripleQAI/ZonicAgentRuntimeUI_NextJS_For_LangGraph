'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { onTurnEnd, useRunStore } from '@/store/run';

/** A 401 from the runtime proxy: the token could not be refreshed, so the sign-in prompt shows (U-11). */
const signInOnExpiry = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) useRunStore.setState({ authExpired: true });
};

/**
 * Client-side providers: the query cache (TanStack Query). A finished turn reloads what it saved:
 * the session's messages, the session list (titles, order) and the run.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: signInOnExpiry }),
        mutationCache: new MutationCache({ onError: signInOnExpiry }),
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
      }),
  );
  useEffect(
    () =>
      onTurnEnd((run) => {
        if (run.sessionId) {
          void client.invalidateQueries({ queryKey: ['messages', run.sessionId] });
          void client.invalidateQueries({ queryKey: ['session', run.sessionId] });
        }
        if (run.runId) void client.invalidateQueries({ queryKey: ['run', run.runId] });
        void client.invalidateQueries({ queryKey: ['sessions'] });
      }),
    [client],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
