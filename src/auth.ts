import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { OIDC_PROVIDER_ID, oidcProvider } from '@/lib/auth/provider';
import { refreshIfExpired, refreshWithIssuer, type REFRESH_ERROR } from '@/lib/auth/refresh';
import { serverConfig } from '@/lib/config/runtime';

/**
 * Auth.js with one configurable OIDC provider (decision Q1: the Cognito user pool for local and
 * CI end-to-end tests; issuer and client from the environment). The access token stays in the
 * encrypted session cookie: the session object sent to the browser never includes it, and the
 * runtime proxy reads it on the server (src/lib/auth/token.ts).
 */
export { OIDC_PROVIDER_ID };

export interface RuntimeTokenFields {
  accessToken?: string;
  refreshToken?: string;
  /** Seconds since the epoch. */
  expiresAt?: number;
  /** Set when the token could not be refreshed (src/lib/auth/refresh.ts). */
  error?: typeof REFRESH_ERROR;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { auth: oidc } = serverConfig();
  return {
    providers: [oidcProvider(oidc)],
    pages: { signIn: '/login' },
    session: { strategy: 'jwt' },
    callbacks: {
      async jwt({ token, account }): Promise<JWT> {
        if (account) {
          const fields: RuntimeTokenFields = {
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at,
          };
          return { ...token, ...fields };
        }
        // Refreshed on the server, so the browser still never sees a token (case U-11).
        return refreshIfExpired(token as JWT & RuntimeTokenFields, Date.now(), (refreshToken) =>
          refreshWithIssuer(oidc, refreshToken),
        );
      },
      session({ session }) {
        // Deliberately no token fields: the browser never sees the access token.
        return session;
      },
      authorized({ auth: session }) {
        return Boolean(session?.user);
      },
    },
  };
});
