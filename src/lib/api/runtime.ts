import { createApiClient, type ApiClient } from './client';
import type { paths } from './generated/schema';

/**
 * The runtime API (design Section 12.2) as typed calls over the fetch wrapper. Every path is a key
 * of the generated OpenAPI `paths` and every body and response type comes from it, so a renamed
 * path or a changed model fails the type check (case U-14).
 */
const PATHS = {
  agents: '/v1/catalog/agents',
  sessions: '/v1/sessions',
  session: '/v1/sessions/{sessionId}',
  messages: '/v1/sessions/{sessionId}/messages',
  runs: '/v1/runs',
  run: '/v1/runs/{runId}',
  runEvents: '/v1/runs/{runId}/events',
  runNodes: '/v1/runs/{runId}/nodes',
  cancel: '/v1/runs/{runId}/cancel',
  interrupts: '/v1/runs/{runId}/interrupts',
  interrupt: '/v1/runs/{runId}/interrupts/{interruptId}',
  dataset: '/v1/datasets/{datasetId}',
  trace: '/v1/runs/{runId}/trace',
  feedback: '/v1/messages/{messageId}/feedback',
} as const satisfies Record<string, keyof paths>;

type Path = (typeof PATHS)[keyof typeof PATHS];
type Method = 'get' | 'post' | 'patch';
type Operation<P extends Path, M extends Method> = NonNullable<paths[P][M]>;
type JsonContent<R> = R extends { content: { 'application/json': infer T } } ? T : undefined;
type Responses<O> = O extends { responses: infer R } ? R : never;
/** The JSON body of the operation's first success response (200, then 201, then 202). */
type Ok<P extends Path, M extends Method> =
  Responses<Operation<P, M>> extends infer R
    ? 200 extends keyof R
      ? JsonContent<R[200]>
      : 201 extends keyof R
        ? JsonContent<R[201]>
        : 202 extends keyof R
          ? JsonContent<R[202]>
          : never
    : never;
type Body<P extends Path, M extends Method> = Operation<P, M> extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** Fills `{name}` segments, encoded. */
const fill = (path: string, params: Record<string, string>): string =>
  path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));

export type Schemas = import('./generated/schema').components['schemas'];
export type AgentCard = Schemas['AgentCard'];
export type Session = Schemas['Session'];
export type Message = Schemas['Message'];
export type Run = Schemas['Run'];
export type RunInterrupt = Schemas['RunInterrupt'];
export type DatasetPage = Schemas['DatasetPage'];
export type TimelineEntry = Schemas['TimelineEntry'];
export type Trace = Schemas['Trace'];
export type TraceObservation = Schemas['TraceObservation'];
export type StartRunRequest = Body<typeof PATHS.runs, 'post'>;
export type AnswerInterruptRequest = Body<typeof PATHS.interrupt, 'post'>;

export interface SessionQuery {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: 'active' | 'archived' | 'all';
}

export interface DatasetQuery {
  page: number;
  pageSize: number;
  /** `field` or `field:desc`. */
  sort?: string;
  /** Field to contained text. */
  filter?: Record<string, string>;
}

export interface StreamRequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export function createRuntimeApi(client: ApiClient = createApiClient()) {
  const sse = { accept: 'text/event-stream' };
  return {
    listAgents: () => client.get<Ok<typeof PATHS.agents, 'get'>>(PATHS.agents),

    listSessions: (query: SessionQuery = {}) =>
      client.get<Ok<typeof PATHS.sessions, 'get'>>(PATHS.sessions, { query: { ...query } }),
    createSession: (body: Body<typeof PATHS.sessions, 'post'>) =>
      client.post<Ok<typeof PATHS.sessions, 'post'>>(PATHS.sessions, body),
    getSession: (sessionId: string) =>
      client.get<Ok<typeof PATHS.session, 'get'>>(fill(PATHS.session, { sessionId })),
    updateSession: (sessionId: string, body: Body<typeof PATHS.session, 'patch'>) =>
      client.patch<Ok<typeof PATHS.session, 'patch'>>(fill(PATHS.session, { sessionId }), body),
    listMessages: (sessionId: string, query: { cursor?: string; limit?: number } = {}) =>
      client.get<Ok<typeof PATHS.messages, 'get'>>(fill(PATHS.messages, { sessionId }), { query: { ...query } }),

    /** Starts a run in `stream` mode; the response body is the event stream. */
    startRunStream: (body: StartRunRequest, options: StreamRequestOptions = {}) =>
      client.raw('POST', PATHS.runs, {
        body,
        signal: options.signal,
        headers: { ...sse, ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}) },
      }),
    /** The run's live events after `lastEventId` (its replay buffer, then the live stream). */
    runEvents: (runId: string, lastEventId: number | undefined, signal?: AbortSignal) =>
      client.raw('GET', fill(PATHS.runEvents, { runId }), {
        signal,
        headers: { ...sse, ...(lastEventId !== undefined ? { 'last-event-id': String(lastEventId) } : {}) },
      }),
    getRun: (runId: string) => client.get<Ok<typeof PATHS.run, 'get'>>(fill(PATHS.run, { runId })),
    runNodes: (runId: string) => client.get<Ok<typeof PATHS.runNodes, 'get'>>(fill(PATHS.runNodes, { runId })),
    cancelRun: (runId: string) => client.post<Ok<typeof PATHS.cancel, 'post'>>(fill(PATHS.cancel, { runId })),
    listInterrupts: (runId: string) =>
      client.get<Ok<typeof PATHS.interrupts, 'get'>>(fill(PATHS.interrupts, { runId })),
    /** Answers an interrupt in `stream` mode; the response body is the resumed turn's events. */
    answerInterruptStream: (
      runId: string,
      interruptId: string,
      body: AnswerInterruptRequest,
      options: StreamRequestOptions = {},
    ) =>
      client.raw('POST', fill(PATHS.interrupt, { runId, interruptId }), {
        body,
        signal: options.signal,
        headers: sse,
      }),
    datasetPage: (datasetId: string, query: DatasetQuery, signal?: AbortSignal) =>
      client.get<Ok<typeof PATHS.dataset, 'get'>>(fill(PATHS.dataset, { datasetId }), {
        signal,
        query: {
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort,
          filter: query.filter && Object.keys(query.filter).length > 0 ? JSON.stringify(query.filter) : undefined,
        },
      }),
    runTrace: (runId: string) => client.get<Ok<typeof PATHS.trace, 'get'>>(fill(PATHS.trace, { runId })),
    feedback: (messageId: string, body: Body<typeof PATHS.feedback, 'post'>) =>
      client.post<void>(fill(PATHS.feedback, { messageId }), body),
  };
}

export type RuntimeApi = ReturnType<typeof createRuntimeApi>;

/** The browser's API: same-origin calls through the runtime proxy. */
export const runtimeApi: RuntimeApi = createRuntimeApi();
