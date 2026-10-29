import { vi } from 'vitest';
import type { TypedRunEvent } from '@/lib/api/types';

/** One recorded request to the runtime proxy. */
export interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (request: Recorded) => Response | Promise<Response>;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const envelope = (status: number, code: string, message: string, retryable = false, details?: unknown[]) =>
  json({ error: { code, message, traceId: `trace-${code}`, retryable, ...(details ? { details } : {}) } }, status);

/** An SSE response the test writes to frame by frame. */
export class SseFeed {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private readonly encoder = new TextEncoder();
  readonly response: Response;
  closed = false;

  constructor() {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.closed = true;
      },
    });
    this.response = new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  /** Writes raw text (to split frames across chunks). */
  raw(text: string) {
    if (!this.closed) this.controller.enqueue(this.encoder.encode(text));
  }

  send(event: TypedRunEvent) {
    this.raw(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  heartbeat(seq: number) {
    this.raw(`event: heartbeat\ndata: ${JSON.stringify({ seq, type: 'heartbeat', data: {} })}\n\n`);
  }

  end() {
    if (this.closed) return;
    this.closed = true;
    this.controller.close();
  }

  /** A dropped connection. */
  fail() {
    if (this.closed) return;
    this.closed = true;
    this.controller.error(new TypeError('network error'));
  }
}

/** An SSE response with these events, already ended. */
export function sse(events: TypedRunEvent[]): Response {
  const feed = new SseFeed();
  events.forEach((event) => feed.send(event));
  feed.end();
  return feed.response;
}

let counter = 0;
/** A run event with the envelope filled in. */
export function ev<K extends TypedRunEvent['type']>(
  seq: number,
  type: K,
  data: Extract<TypedRunEvent, { type: K }>['data'],
  extra: { nodeId?: string; path?: string; runId?: string } = {},
): Extract<TypedRunEvent, { type: K }> {
  counter += 1;
  return {
    id: `e${counter}`,
    runId: extra.runId ?? 'run-1',
    seq,
    type,
    ts: '2026-10-27T10:00:00.000Z',
    ...(extra.nodeId ? { nodeId: extra.nodeId } : {}),
    ...(extra.path ? { path: extra.path } : {}),
    data,
  } as Extract<TypedRunEvent, { type: K }>;
}

/**
 * A fake of the runtime behind `/api/runtime`: `fetch` is stubbed, each request is recorded, and
 * routes (`'POST /v1/runs'`, with `{id}` segments) answer it. Unrouted requests are 404 envelopes.
 */
export function fakeRuntime() {
  const routes: { method: string; pattern: RegExp; handler: Handler }[] = [];
  const requests: Recorded[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://ui.test');
    const prefix = '/api/runtime';
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const request: Recorded = {
      method: (init.method ?? 'GET').toUpperCase(),
      path,
      query: url.searchParams,
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const route = routes.find((item) => item.method === request.method && item.pattern.test(path));
    if (!route) return envelope(404, 'ROUTE_NOT_FOUND', `no fake route for ${request.method} ${path}`);
    return route.handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    requests,
    fetch: fetchMock,
    /** Adds a route answering with a handler, a response or a JSON body; later routes take precedence. */
    on(route: string, handler: Handler | Response | object) {
      const [method, template] = route.split(' ') as [string, string];
      const pattern = new RegExp(`^${template.replace(/\{\w+\}/g, '[^/]+')}$`);
      const respond: Handler =
        typeof handler === 'function'
          ? (handler as Handler)
          : handler instanceof Response
            ? () => (handler as Response).clone()
            : () => json(handler);
      routes.unshift({ method: method.toUpperCase(), pattern, handler: respond });
      return this;
    },
    /** The requests to a route, in order. */
    calls(route: string) {
      const [method, template] = route.split(' ') as [string, string];
      const pattern = new RegExp(`^${template.replace(/\{\w+\}/g, '[^/]+')}$`);
      return requests.filter((request) => request.method === method && pattern.test(request.path));
    },
  };
}

export type FakeRuntime = ReturnType<typeof fakeRuntime>;
