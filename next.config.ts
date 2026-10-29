import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // The container image runs the standalone server (Dockerfile); `next start` needs the default.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // The browser talks only to this origin: /api/runtime/* is a route handler that forwards to the
  // runtime server with the user's access token (src/app/api/runtime/[...path]/route.ts).
};

export default config;
