import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { cspConfig } from '@/lib/config/runtime';
import { contentSecurityPolicy, newNonce } from '@/lib/security/csp';

/** Pages a signed-out user may open. */
const PUBLIC_PAGES = new Set(['/login']);
const CSP = 'content-security-policy';

/**
 * Every page gets the Content Security Policy with a fresh nonce (task P6-01): on the request, so
 * Next.js puts the nonce on its scripts, and on the response. Every page except the sign-in page
 * needs a signed-in user; a signed-out one goes to the sign-in page and back afterwards. The
 * Auth.js routes, the runtime proxy (it checks its own token) and static files are excluded.
 */
const guard = auth((request) => {
  const policy = contentSecurityPolicy(newNonce(), cspConfig());
  if (!request.auth?.user && !PUBLIC_PAGES.has(request.nextUrl.pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = '/login';
    signIn.search = '';
    // A path, not the URL: behind a load balancer the request's own host is the container's.
    signIn.searchParams.set('callbackUrl', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(signIn);
    redirect.headers.set(CSP, policy);
    return redirect;
  }
  const headers = new Headers(request.headers);
  headers.set(CSP, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CSP, policy);
  return response;
});

type Middleware = (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

/** The Auth.js config is lazy (src/auth.ts), so wrapping a handler gives a promise of the middleware. */
export async function middleware(request: NextRequest, event: NextFetchEvent): Promise<Response> {
  const handler = (await guard) as unknown as Middleware;
  return handler(request, event);
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api/auth|api/runtime|_next/static|_next/image|favicon.png|tripleq-logo).*)'],
};
