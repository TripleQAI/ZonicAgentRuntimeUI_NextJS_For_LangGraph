import type { NextConfig } from 'next';

// A path to serve the app under, such as /agent-runtime-lg (deploy/aws-lambda); empty at the root.
const BASE_PATH = (process.env.NEXT_BASE_PATH ?? '').replace(/\/+$/, '');
// Hosts the browser may post server actions from when it is not the host the server sees: behind
// CloudFront the server sees the Lambda Function URL's, the browser dev.tripleq.ai (deploy/aws-lambda).
const ACTION_ORIGINS = (process.env.NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

const config: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // The container image runs the standalone server (Dockerfile); `next start` needs the default.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  ...(ACTION_ORIGINS.length ? { experimental: { serverActions: { allowedOrigins: ACTION_ORIGINS } } } : {}),
  // Read by src/lib/config/runtime.ts, in server and browser code alike.
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  // The browser talks only to this origin: /api/runtime/* is a route handler that forwards to the
  // runtime server with the user's access token (src/app/api/runtime/[...path]/route.ts).
};

export default config;
