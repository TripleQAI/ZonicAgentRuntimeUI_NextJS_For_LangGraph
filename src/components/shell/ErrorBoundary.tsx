'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { ErrorPanel } from './ErrorPanel';

interface State {
  error?: Error;
}

/**
 * Error boundary for client components (task U0-04). Runtime errors show the envelope's user-safe
 * message; anything else shows the catalog's generic message. Retry re-renders the children.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // No logging in the UI; the runtime records failures in its Langfuse traces.
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorPanel
        message={error instanceof ApiError ? error.message : undefined}
        onRetry={() => this.setState({ error: undefined })}
      />
    );
  }
}
