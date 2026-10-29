import { getToken } from 'next-auth/jwt';
import type { RuntimeTokenFields } from '@/auth';
import { serverConfig } from '@/lib/config/runtime';

/** Seconds of clock skew tolerated before an access token counts as expired. */
export const EXPIRY_SKEW_SECONDS = 30;

export type TokenState =
  | { status: 'valid'; accessToken: string }
  | { status: 'missing' }
  | { status: 'expired' };

/** Decides whether stored token fields can call the runtime now. */
export function tokenState(fields: RuntimeTokenFields | null, nowSeconds = Date.now() / 1000): TokenState {
  if (!fields?.accessToken) return { status: 'missing' };
  if (fields.expiresAt !== undefined && fields.expiresAt - EXPIRY_SKEW_SECONDS <= nowSeconds) return { status: 'expired' };
  return { status: 'valid', accessToken: fields.accessToken };
}

/**
 * Runs the session's `jwt` callback, which refreshes an expiring token, and returns the Set-Cookie
 * headers of the refreshed session (the route handler passes `auth({ req, res })`).
 */
export type SessionRefresher = (request: Request) => Promise<string[]>;

/**
 * The request's cookies with the Set-Cookie headers applied: changed cookies replaced, cleared ones
 * removed. The session cookie may be split into chunks, and a refresh can change their number.
 */
export function applySetCookies(cookieHeader: string, setCookies: readonly string[]): string {
  const cookies = new Map(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes('='))
      .map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)] as const),
  );
  for (const header of setCookies) {
    const [pair = '', ...attributes] = header.split(';');
    const name = pair.slice(0, pair.indexOf('=')).trim();
    const value = pair.slice(pair.indexOf('=') + 1).trim();
    const cleared = value === '' || attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (cleared) cookies.delete(name);
    else cookies.set(name, value);
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * Token access helper (task U0-02): reads the access token from the encrypted session cookie on the
 * server. Only route handlers and server components call it. When the token has expired and a
 * `refreshSession` is given, the session is refreshed first (case U-11); its Set-Cookie headers are
 * returned so the response stores the new token in the browser's cookie.
 */
export async function accessTokenFor(
  request: Request,
  refreshSession?: SessionRefresher,
): Promise<{ token: TokenState; setCookies: string[] }> {
  const secureCookie = new URL(request.url).protocol === 'https:';
  const read = async (cookie: string) =>
    tokenState(
      (await getToken({
        req: { headers: new Headers({ cookie }) },
        secret: serverConfig().authSecret,
        secureCookie,
      })) as RuntimeTokenFields | null,
    );
  const cookie = request.headers.get('cookie') ?? '';
  const token = await read(cookie);
  if (token.status !== 'expired' || !refreshSession) return { token, setCookies: [] };
  const setCookies = await refreshSession(request);
  return { token: await read(applySetCookies(cookie, setCookies)), setCookies };
}
