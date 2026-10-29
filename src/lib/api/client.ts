import type { ErrorDetail, ErrorEnvelope } from './generated/models';
import { publicConfig } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';

/** An error response in the runtime's envelope (design Section 12.1), or a transport failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly retryable: boolean,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Same-origin proxy path in the browser; the runtime URL on the server. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Only server-side callers pass a token; browser calls go through the proxy, which adds it. */
  getToken?: () => Promise<string | undefined>;
  newRequestId?: () => string;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const isEnvelope = (value: unknown): value is ErrorEnvelope =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ErrorEnvelope).error?.code === 'string' &&
  typeof (value as ErrorEnvelope).error?.message === 'string';

/**
 * The fetch wrapper every API call uses (task U0-03): JSON bodies, a correlation ID per request
 * (`X-Request-Id`), the bearer token when one is available, and one error type built from the
 * runtime's error envelope. Typed paths come from the generated OpenAPI types.
 */
export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? publicConfig.apiBasePath).replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const newRequestId = options.newRequestId ?? (() => crypto.randomUUID());

  async function raw(method: string, path: string, request: RequestOptions = {}): Promise<Response> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(request.query ?? {})) if (value !== undefined) query.set(key, String(value));
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}${query.size > 0 ? `?${query}` : ''}`;
    const requestId = newRequestId();
    const headers: Record<string, string> = { accept: 'application/json', 'x-request-id': requestId, ...request.headers };
    const token = await options.getToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: request.signal,
        credentials: 'same-origin',
      });
    } catch (error) {
      if (request.signal?.aborted) throw error;
      throw new ApiError(0, 'NETWORK_ERROR', t('error.network'), requestId, true);
    }
    if (!response.ok) throw await toApiError(response, requestId);
    return response;
  }

  async function request<T>(method: string, path: string, requestOptions?: RequestOptions): Promise<T> {
    const response = await raw(method, path, requestOptions);
    // `201` from feedback and `204` carry no body.
    const text = await response.text();
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }

  return {
    raw,
    request,
    get: <T>(path: string, o?: RequestOptions) => request<T>('GET', path, o),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('POST', path, { ...o, body }),
    patch: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PATCH', path, { ...o, body }),
    delete: <T>(path: string, o?: RequestOptions) => request<T>('DELETE', path, o),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function toApiError(response: Response, requestId: string): Promise<ApiError> {
  const id = response.headers.get('x-request-id') ?? requestId;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (isEnvelope(body)) {
    const { code, message, details, traceId, retryable } = body.error;
    return new ApiError(response.status, code, message, traceId ?? id, retryable ?? response.status >= 500, details ?? []);
  }
  return new ApiError(response.status, 'UNEXPECTED_RESPONSE', t('error.unexpected'), id, response.status >= 500);
}
