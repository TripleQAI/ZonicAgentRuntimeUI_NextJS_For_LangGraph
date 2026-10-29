'use client';

import { ErrorPanel } from '@/components/shell/ErrorPanel';

/** Route-level error boundary for the protected pages. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorPanel onRetry={reset} />;
}
