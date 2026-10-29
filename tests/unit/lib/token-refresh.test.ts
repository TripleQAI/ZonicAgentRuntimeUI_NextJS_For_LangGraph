// @vitest-environment node
import { encode } from 'next-auth/jwt';
import type { RuntimeTokenFields } from '@/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_ERROR, refreshIfExpired, refreshWithIssuer } from '@/lib/auth/refresh';
import { accessTokenFor, applySetCookies, EXPIRY_SKEW_SECONDS } from '@/lib/auth/token';

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const nowSeconds = NOW / 1000;
const SECRET = 'test-secret-for-session-cookies-0000000';
const COOKIE = 'authjs.session-token';

describe('silent token refresh', () => {
  it('[U-11] a token about to expire is refreshed, keeping the refresh token the provider did not rotate', async () => {
    const token = { accessToken: 'old', refreshToken: 'r1', expiresAt: nowSeconds + EXPIRY_SKEW_SECONDS - 1 };
    const refresh = vi.fn(async () => ({ access_token: 'new', expires_in: 3600 }));
    expect(await refreshIfExpired(token, NOW, refresh)).toEqual({
      accessToken: 'new',
      refreshToken: 'r1',
      expiresAt: nowSeconds + 3600,
    });
    expect(refresh).toHaveBeenCalledWith('r1');
  });

  it('[U-11] a failed refresh drops the access token and marks the session, so the proxy answers 401', async () => {
    const expired = { accessToken: 'old', refreshToken: 'r1', expiresAt: nowSeconds - 10 };
    expect(await refreshIfExpired(expired, NOW, () => Promise.reject(new Error('invalid_grant')))).toEqual({
      refreshToken: 'r1',
      expiresAt: nowSeconds - 10,
      error: REFRESH_ERROR,
    });
    const noRefreshToken: RuntimeTokenFields = {
      accessToken: 'old',
      expiresAt: nowSeconds - 10,
    };
    const result = await refreshIfExpired(noRefreshToken, NOW, vi.fn());
    expect(result.accessToken).toBeUndefined();
    expect(result.error).toBe(REFRESH_ERROR);
  });

  it('leaves a valid token alone, and a later successful refresh clears an earlier error', async () => {
    const valid = { accessToken: 'a', refreshToken: 'r', expiresAt: nowSeconds + 3600 };
    const refresh = vi.fn();
    expect(await refreshIfExpired(valid, NOW, refresh)).toBe(valid);
    expect(refresh).not.toHaveBeenCalled();
    const recovered = await refreshIfExpired(
      { refreshToken: 'r', expiresAt: nowSeconds - 1, error: REFRESH_ERROR },
      NOW,
      async () => ({ access_token: 'b', refresh_token: 'r2', expires_in: 60 }),
    );
    expect(recovered).toEqual({ accessToken: 'b', refreshToken: 'r2', expiresAt: nowSeconds + 60 });
  });

  it('refreshes at the token endpoint found by OIDC discovery, with Basic authentication for a confidential client', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith('/.well-known/openid-configuration')
        ? Response.json({ token_endpoint: 'https://idp.test/oauth2/token' })
        : Response.json({ access_token: 'fresh', expires_in: 300 });
    });
    const response = await refreshWithIssuer(
      { issuer: 'https://idp.test/pool/', clientId: 'client', clientSecret: 's3cret' },
      'r1',
      fetchMock as unknown as typeof fetch,
    );
    expect(response.access_token).toBe('fresh');
    expect(calls.map((call) => call.url)).toEqual([
      'https://idp.test/pool/.well-known/openid-configuration',
      'https://idp.test/oauth2/token',
    ]);
    expect(Object.fromEntries(new URLSearchParams(String(calls[1]!.init!.body)))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'client',
    });
    expect((calls[1]!.init!.headers as Record<string, string>).authorization).toBe(
      `Basic ${btoa('client:s3cret')}`,
    );
    const failing = vi.fn(async () => new Response('', { status: 400 }));
    await expect(
      refreshWithIssuer(
        { issuer: 'https://idp.test', clientId: 'c', clientSecret: undefined },
        'r',
        failing as unknown as typeof fetch,
      ),
    ).rejects.toThrow('OIDC discovery failed');
  });
});

describe('token access in the runtime proxy', () => {
  beforeEach(() => {
    vi.stubEnv('RUNTIME_API_URL', 'http://runtime.test');
    vi.stubEnv('AUTH_SECRET', SECRET);
    vi.stubEnv('AUTH_OIDC_ISSUER', 'https://idp.test');
    vi.stubEnv('AUTH_OIDC_CLIENT_ID', 'client');
  });
  afterEach(() => vi.unstubAllEnvs());

  const sessionCookie = (fields: Record<string, unknown>) =>
    encode({ token: { sub: 'user-1', ...fields }, secret: SECRET, salt: COOKIE });
  const request = (cookie: string) =>
    new Request('http://ui.test/api/runtime/v1/catalog/agents', {
      headers: { cookie: `other=1; ${COOKIE}=${cookie}` },
    });

  it('[U-11] an expired token is refreshed through the session before the call, and the new cookie is returned', async () => {
    const expired = await sessionCookie({
      accessToken: 'at-1',
      refreshToken: 'r1',
      expiresAt: Date.now() / 1000 - 5,
    });
    const fresh = await sessionCookie({
      accessToken: 'at-2',
      refreshToken: 'r1',
      expiresAt: Date.now() / 1000 + 3600,
    });
    const setCookie = `${COOKIE}=${fresh}; Path=/; HttpOnly; SameSite=Lax`;
    const refreshSession = vi.fn(async () => [setCookie]);
    const result = await accessTokenFor(request(expired), refreshSession);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ token: { status: 'valid', accessToken: 'at-2' }, setCookies: [setCookie] });
  });

  it('a valid token needs no session refresh; without a refresher an expired token stays expired', async () => {
    const valid = await sessionCookie({ accessToken: 'at-1', expiresAt: Date.now() / 1000 + 3600 });
    const refreshSession = vi.fn(async () => []);
    expect(await accessTokenFor(request(valid), refreshSession)).toEqual({
      token: { status: 'valid', accessToken: 'at-1' },
      setCookies: [],
    });
    expect(refreshSession).not.toHaveBeenCalled();
    const expired = await sessionCookie({ accessToken: 'at-1', expiresAt: Date.now() / 1000 - 5 });
    expect((await accessTokenFor(request(expired))).token).toEqual({ status: 'expired' });
  });

  it('applies Set-Cookie headers to the request cookies, removing cleared session chunks', () => {
    expect(
      applySetCookies('a=1; authjs.session-token.0=x; authjs.session-token.1=y', [
        'authjs.session-token.0=z; Path=/; HttpOnly',
        'authjs.session-token.1=; Path=/; Max-Age=0',
        'b=2; Path=/',
      ]),
    ).toBe('a=1; authjs.session-token.0=z; b=2');
  });
});
