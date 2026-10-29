import { describe, expect, it } from 'vitest';
import { cspConfig } from '@/lib/config/runtime';
import { contentSecurityPolicy, newNonce } from '@/lib/security/csp';

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((item) => item.startsWith(`${name} `))
    ?.split(' ')
    .slice(1);

describe('the Content Security Policy (P6-01)', () => {
  it('allows scripts only from this origin with the nonce: no inline scripts, no eval, no framing', () => {
    const policy = contentSecurityPolicy('abc', cspConfig({ NODE_ENV: 'production' }));
    expect(directive(policy, 'script-src')).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'connect-src')).toEqual(["'self'"]);
    expect(directive(policy, 'font-src')).toEqual(["'self'", 'https://fonts.gstatic.com']);
  });

  it('takes the style and font origins from the environment; development adds eval and the reload socket', () => {
    const config = cspConfig({ NODE_ENV: 'development', CSP_STYLE_ORIGINS: 'https://a.test, https://b.test', CSP_FONT_ORIGINS: '' });
    const policy = contentSecurityPolicy('n', config);
    expect(directive(policy, 'style-src')).toEqual(["'self'", "'unsafe-inline'", 'https://a.test', 'https://b.test']);
    expect(directive(policy, 'font-src')).toEqual(["'self'", 'https://fonts.gstatic.com']);
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy, 'connect-src')).toContain('ws:');
  });

  it('makes a new nonce for each request', () => {
    const nonces = new Set(Array.from({ length: 20 }, () => newNonce()));
    expect(nonces.size).toBe(20);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
