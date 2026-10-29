import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '@/lib/api/client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('API client', () => {
  it('sends a request ID, JSON body and the bearer token when one is available', async () => {
    const fetchMock = vi.fn(async () => json(201, { sessionId: 's-1' }));
    const client = createApiClient({
      baseUrl: 'http://runtime.test',
      fetch: fetchMock,
      getToken: async () => 'token-1',
      newRequestId: () => 'req-1',
    });
    const result = await client.post<{ sessionId: string }>('/v1/sessions', { agenticWorkflowId: 'wf' });
    expect(result.sessionId).toBe('s-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://runtime.test/v1/sessions');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-request-id']).toBe('req-1');
    expect(headers.authorization).toBe('Bearer token-1');
    expect(headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"agenticWorkflowId":"wf"}');
  });

  it('accepts a success response without a body (feedback answers 201 with none)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    await expect(createApiClient({ fetch: fetchMock }).post('/v1/messages/m/feedback', { rating: 1 })).resolves.toBeUndefined();
  });

  it('uses the same-origin proxy path by default and encodes query parameters', async () => {
    const fetchMock = vi.fn(async () => json(200, { items: [] }));
    await createApiClient({ fetch: fetchMock }).get('/v1/sessions', { query: { q: 'energy report', limit: 20, cursor: undefined } });
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('/api/runtime/v1/sessions?q=energy+report&limit=20');
  });

  it('turns the runtime error envelope into an ApiError with code, message, trace ID and details', async () => {
    const fetchMock = vi.fn(async () =>
      json(400, {
        error: {
          code: 'INPUT_INVALID',
          message: 'The request is not valid.',
          traceId: 'trace-9',
          details: [{ path: 'input.text', message: 'should not be empty', type: 'string_too_short' }],
        },
      }),
    );
    const error = await createApiClient({ fetch: fetchMock }).post('/v1/runs', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'INPUT_INVALID',
      message: 'The request is not valid.',
      requestId: 'trace-9',
      retryable: false,
    });
    expect((error as ApiError).details[0]?.path).toBe('input.text');
  });

  it('marks server errors retryable and reports non-envelope bodies with the catalog message', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = (await createApiClient({ fetch: fetchMock, newRequestId: () => 'req-2' })
      .get('/v1/catalog/agents')
      .catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('UNEXPECTED_RESPONSE');
    expect(error.retryable).toBe(true);
    expect(error.requestId).toBe('req-2');
    expect(error.message).toBe('Something went wrong.');
  });

  it('reports a transport failure as a retryable network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const error = (await createApiClient({ fetch: fetchMock }).get('/v1/sessions').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.retryable).toBe(true);
  });

  it('lets an abort propagate unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(createApiClient({ fetch: fetchMock }).get('/v1/sessions', { signal: controller.signal })).rejects.toThrow(
      'aborted',
    );
  });
});
