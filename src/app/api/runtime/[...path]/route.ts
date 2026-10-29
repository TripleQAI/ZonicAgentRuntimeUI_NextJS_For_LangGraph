import { auth } from '@/auth';
import { accessTokenFor } from '@/lib/auth/token';
import { forwardToRuntime } from '@/lib/api/proxy';
import { serverConfig } from '@/lib/config/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

/** Runs the Auth.js session callbacks for this request (refreshing the token) and collects its cookies. */
async function refreshSession(request: Request): Promise<string[]> {
  const response = { headers: new Headers() };
  await (auth as unknown as (context: { req: Request; res: typeof response }) => Promise<unknown>)({
    req: request,
    res: response,
  });
  return response.headers.getSetCookie();
}

async function handle(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const { token, setCookies } = await accessTokenFor(request, refreshSession);
  const response = await forwardToRuntime(request, path, {
    runtimeApiUrl: serverConfig().runtimeApiUrl,
    token,
    newRequestId: () => crypto.randomUUID(),
  });
  // A refreshed token goes back into the encrypted session cookie, never into the response body.
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
