import type { OIDCConfig } from 'next-auth/providers';

/** The provider's ID: the callback path is `/api/auth/callback/tripleq`. */
export const OIDC_PROVIDER_ID = 'tripleq';

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
}

/**
 * The OIDC provider (decision Q1). A client without a secret, such as the Cognito pool's public
 * app client, authenticates with PKCE only (`none`); Auth.js would otherwise send a Basic header
 * with an undefined secret, which the token endpoint refuses.
 */
export function oidcProvider(oidc: OidcSettings): OIDCConfig<Record<string, unknown>> {
  return {
    id: OIDC_PROVIDER_ID,
    name: 'TripleQ AI',
    type: 'oidc',
    issuer: oidc.issuer,
    clientId: oidc.clientId,
    clientSecret: oidc.clientSecret,
    authorization: { params: { scope: oidc.scope } },
    checks: ['pkce', 'state'],
    ...(oidc.clientSecret ? {} : { client: { token_endpoint_auth_method: 'none' } }),
  };
}
