import type { RuntimeTokenFields } from '@/auth';
import type { AuthConfig } from '@/lib/config/runtime';
import { EXPIRY_SKEW_SECONDS } from './token';

/** Marks a session whose token could not be refreshed: the runtime proxy then answers 401. */
export const REFRESH_ERROR = 'RefreshTokenError';

/** A token endpoint response (RFC 6749 Section 5.1). */
export interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

/** The token fields from a refresh response. */
export function fieldsFrom(
  response: TokenResponse,
  nowMs: number,
  previous: RuntimeTokenFields,
): RuntimeTokenFields {
  return {
    accessToken: response.access_token,
    // Providers such as Cognito return no new refresh token; the previous one stays valid.
    refreshToken: response.refresh_token ?? previous.refreshToken,
    expiresAt: response.expires_in !== undefined ? Math.floor(nowMs / 1000) + response.expires_in : undefined,
  };
}

/**
 * Silent refresh (case U-11, task U0-02), run by the Auth.js `jwt` callback on the server: a token
 * that the runtime proxy would treat as expired is refreshed at the issuer. When that fails, the
 * access token is dropped and the session marked, so the proxy answers 401 and the user signs in again.
 */
export async function refreshIfExpired<T extends RuntimeTokenFields>(
  token: T,
  nowMs: number,
  refresh: (refreshToken: string) => Promise<TokenResponse>,
): Promise<T> {
  if (token.expiresAt === undefined || token.expiresAt - EXPIRY_SKEW_SECONDS > nowMs / 1000) return token;
  if (!token.refreshToken) return failed(token);
  try {
    const { error: _error, ...rest } = token;
    return { ...rest, ...fieldsFrom(await refresh(token.refreshToken), nowMs, token) } as T;
  } catch {
    return failed(token);
  }
}

function failed<T extends RuntimeTokenFields>(token: T): T {
  const { accessToken: _accessToken, ...rest } = token;
  return { ...rest, error: REFRESH_ERROR } as T;
}

/** Calls the issuer's token endpoint (found by OIDC discovery) with the refresh token grant. */
export async function refreshWithIssuer(
  settings: Pick<AuthConfig, 'issuer' | 'clientId' | 'clientSecret'>,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const discovery = await fetchImpl(
    `${settings.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`,
  );
  if (!discovery.ok) throw new Error(`OIDC discovery failed with HTTP ${discovery.status}`);
  const { token_endpoint: endpoint } = (await discovery.json()) as { token_endpoint: string };
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: settings.clientId,
  });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (settings.clientSecret)
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(settings.clientId)}:${encodeURIComponent(settings.clientSecret)}`)}`;
  const response = await fetchImpl(endpoint, { method: 'POST', headers, body });
  if (!response.ok) throw new Error(`token refresh failed with HTTP ${response.status}`);
  return (await response.json()) as TokenResponse;
}
