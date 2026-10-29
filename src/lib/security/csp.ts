import type { CspConfig } from '@/lib/config/runtime';

/**
 * The Content Security Policy of every page (task P6-01): scripts only from this origin with the
 * request's nonce, which Next.js puts on its own scripts (`strict-dynamic` lets them load their
 * chunks); no inline scripts, no plugins, no framing. Styles may be inline: React style attributes,
 * the grid and the chart set them. The browser calls only this origin (the runtime proxy).
 */
export function contentSecurityPolicy(nonce: string, config: CspConfig): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(config.development ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'", ...config.styleOrigins],
    'font-src': ["'self'", ...config.fontOrigins],
    'img-src': ["'self'", 'data:', 'blob:'],
    'connect-src': ["'self'", ...(config.development ? ['ws:'] : [])],
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/** A fresh nonce per request (base64 of 16 random bytes). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
