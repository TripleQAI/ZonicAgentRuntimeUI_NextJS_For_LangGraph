import { NextRequest } from 'next/server';
import { handlers } from '@/auth';
import { publicConfig } from '@/lib/config/runtime';

/**
 * Under a base path, Next.js gives a route handler the URL without it, while Auth.js reads its
 * actions below the base path of AUTH_URL (/<base>/api/auth): the URL gets the base path back.
 */
function withAppPath(request: NextRequest): NextRequest {
  const { basePath } = publicConfig;
  const { pathname, search, origin } = request.nextUrl;
  if (!basePath || pathname.startsWith(`${basePath}/`)) return request;
  return new NextRequest(new URL(`${basePath}${pathname}${search}`, origin), request);
}

export const GET = (request: NextRequest) => handlers.GET(withAppPath(request));
export const POST = (request: NextRequest) => handlers.POST(withAppPath(request));
