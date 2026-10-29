import { describe, expect, it, vi } from 'vitest';
import { forwardToRuntime } from '@/lib/api/proxy';
import { tokenState } from '@/lib/auth/token';

const options = (fetchMock: typeof fetch, token = tokenState({ accessToken: 'at-1' })) => ({
  runtimeApiUrl: 'http://runtime.test',
  token,
  newRequestId: () => 'req-1',
  fetch: fetchMock,
});

describe('runtime proxy', () => {
  it('attaches the access token on the server and forwards only the allowed headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const request = new Request('http://ui.test/api/runtime/v1/runs?mode=stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=secret', 'last-event-id': '7', 'idempotency-key': 'k-1' },
      body: '{"input":{"text":"hi"}}',
    });
    const response = await forwardToRuntime(request, ['v1', 'runs'], options(fetchMock as unknown as typeof fetch));
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://runtime.test/v1/runs?mode=stream');
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer at-1');
    expect(headers.get('last-event-id')).toBe('7');
    expect(headers.get('idempotency-key')).toBe('k-1');
    expect(headers.get('x-request-id')).toBe('req-1');
    expect(headers.get('cookie')).toBeNull();
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"input":{"text":"hi"}}');
  });

  it('streams the upstream body through unchanged (SSE)', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('id: 1\nevent: run.started\ndata: {}\n\n'));
        controller.enqueue(encoder.encode('id: 2\nevent: token.delta\ndata: {"text":"Hi"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } }));
    const response = await forwardToRuntime(new Request('http://ui.test/api/runtime/v1/runs/r1/events'), ['v1', 'runs', 'r1', 'events'], options(fetchMock as unknown as typeof fetch));
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toContain('event: token.delta');
  });

  it('[U-11] an expired or missing token answers 401 AUTH_REQUIRED without calling the runtime', async () => {
    const fetchMock = vi.fn();
    for (const token of [tokenState({ accessToken: 'at', expiresAt: 10 }, 1000), tokenState(null)]) {
      const response = await forwardToRuntime(new Request('http://ui.test/api/runtime/v1/sessions'), ['v1', 'sessions'], {
        ...options(fetchMock as unknown as typeof fetch),
        token,
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED', traceId: 'req-1' } });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 502 in the error envelope when the runtime cannot be reached', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED');
    });
    const response = await forwardToRuntime(new Request('http://ui.test/api/runtime/v1/sessions'), ['v1', 'sessions'], options(fetchMock as unknown as typeof fetch));
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('encodes path segments', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    await forwardToRuntime(new Request('http://ui.test/x'), ['v1', 'datasets', 'a/b'], options(fetchMock as unknown as typeof fetch));
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://runtime.test/v1/datasets/a%2Fb');
  });
});

describe('token state', () => {
  it('is valid before expiry, expired within the skew, and missing without a token', () => {
    expect(tokenState({ accessToken: 'a', expiresAt: 2000 }, 1000)).toEqual({ status: 'valid', accessToken: 'a' });
    expect(tokenState({ accessToken: 'a', expiresAt: 1010 }, 1000)).toEqual({ status: 'expired' });
    expect(tokenState({}, 1000)).toEqual({ status: 'missing' });
  });
});
