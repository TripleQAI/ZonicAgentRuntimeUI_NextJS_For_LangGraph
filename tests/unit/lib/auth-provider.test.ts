import { describe, expect, it } from 'vitest';
import { oidcProvider } from '@/lib/auth/provider';

const settings = {
  issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
  clientId: 'client',
  scope: 'openid email profile',
};

describe('the OIDC provider (decision Q1)', () => {
  it('authenticates a client without a secret with PKCE only', () => {
    const provider = oidcProvider(settings);
    expect(provider.client).toEqual({ token_endpoint_auth_method: 'none' });
    expect(provider.checks).toEqual(['pkce', 'state']);
  });

  it('leaves a confidential client to Auth.js (its secret in a Basic header)', () => {
    const provider = oidcProvider({ ...settings, clientSecret: 'secret' });
    expect(provider.client).toBeUndefined();
    expect(provider.clientSecret).toBe('secret');
  });
});
