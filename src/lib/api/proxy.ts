import { t } from '@/lib/i18n/t';
import type { TokenState } from '@/lib/auth/token';

/** Request headers the browser may send through to the runtime. */
const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'last-event-id', 'idempotency-key', 'if-none-match', 'x-request-id'];
/** Response headers the runtime may send back (SSE, caching, paging, retry hints). */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'retry-after', 'location', 'x-request-id', 'x-accel-buffering'];

export interface ProxyOptions {
  runtimeApiUrl: string;
  token: TokenState;
  newRequestId: () => string;
  fetch?: typeof fetch;
}

const envelope = (status: number, code: string, message: string, traceId: string): Response =>
  new Response(JSON.stringify({ error: { code, message, traceId } }), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': traceId },
  });

/**
 * Same-origin proxy to the runtime (backend-for-frontend): attaches the user's access token on the
 * server and streams the response back unchanged, so SSE run streams pass through without
 * buffering. The browser never holds the token.
 */
export async function forwardToRuntime(request: Request, path: string[], options: ProxyOptions): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? options.newRequestId();
  if (options.token.status !== 'valid') return envelope(401, 'AUTH_REQUIRED', t('error.authRequired'), requestId);

  const source = new URL(request.url);
  const target = `${options.runtimeApiUrl}/${path.map(encodeURIComponent).join('/')}${source.search}`;
  const headers = new Headers({ authorization: `Bearer ${options.token.accessToken}`, 'x-request-id': requestId });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null && name !== 'x-request-id') headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await (options.fetch ?? fetch)(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: request.signal,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return envelope(502, 'UPSTREAM_UNAVAILABLE', t('error.network'), requestId);
  }
  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has('x-request-id')) responseHeaders.set('x-request-id', requestId);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
