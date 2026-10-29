/**
 * The only module that reads the environment (as on the server, design rule 4). Server-only values
 * never use the NEXT_PUBLIC_ prefix; the browser talks to /api/runtime on its own origin.
 */

export interface AuthConfig {
  /** OIDC issuer, for example the Cognito user pool issuer URL (decision Q1). */
  issuer: string;
  clientId: string;
  clientSecret: string | undefined;
  scope: string;
}

export interface ServerConfig {
  /** Base URL of the LangGraph runtime (ZonicAgentRuntimeBackend_Python_LangGraph), for example http://localhost:8000. */
  runtimeApiUrl: string;
  /** Auth.js cookie encryption secret. */
  authSecret: string;
  auth: AuthConfig;
}

/** The page's Content Security Policy (task P6-01): sources beyond this origin. */
export interface CspConfig {
  /** Stylesheet origins, for example the Nunito font's stylesheet host. */
  styleOrigins: string[];
  fontOrigins: string[];
  /** `next dev` needs `eval` and a websocket for hot reload; never set in a build. */
  development: boolean;
}

export interface StreamConfig {
  /** Reconnects with `Last-Event-ID` after a dropped stream before the run is read once instead (case U-04). */
  reconnectAttempts: number;
  /** First reconnect delay; each further attempt doubles it. */
  reconnectDelayMs: number;
  /** A stream with no event or heartbeat for this long counts as dropped (heartbeats come every few seconds). */
  idleTimeoutMs: number;
  /** How long Stop waits for the run's `run.cancelled` event before closing the stream (case U-03). */
  cancelWaitMs: number;
}

export interface PublicConfig {
  /**
   * The path the app is served under, such as /agent-runtime-lg; empty at the root (next.config.ts,
   * NEXT_BASE_PATH). Next.js adds it to links, router pushes and its own redirects; withBasePath adds
   * it everywhere else.
   */
  basePath: string;
  /** Same-origin path of the runtime proxy route. */
  apiBasePath: string;
  features: {
    attachments: boolean;
  };
  stream: StreamConfig;
  paging: {
    /** Sessions per sidebar page and messages per chat page (the runtime caps both). */
    sessions: number;
    messages: number;
    /** Rows per grid block when a grid part names no page size (case U-06). */
    gridRows: number;
    /** Rows read for a chart that names a dataset. */
    chartRows: number;
  };
  /** Delay before a sidebar search runs, so typing does not send a request per key. */
  searchDebounceMs: number;
  /** How long "Copied" stays on a message's copy action. */
  copiedNoticeMs: number;
  /** Default height of a grid without a `features.height`, in pixels. */
  gridHeightPx: number;
  /** Height of a chart, in pixels. */
  chartHeightPx: number;
}

const numberFrom = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    runtimeApiUrl: required('RUNTIME_API_URL', env.RUNTIME_API_URL).replace(/\/+$/, ''),
    authSecret: required('AUTH_SECRET', env.AUTH_SECRET),
    auth: {
      issuer: required('AUTH_OIDC_ISSUER', env.AUTH_OIDC_ISSUER),
      clientId: required('AUTH_OIDC_CLIENT_ID', env.AUTH_OIDC_CLIENT_ID),
      clientSecret: env.AUTH_OIDC_CLIENT_SECRET || undefined,
      scope: env.AUTH_OIDC_SCOPE || 'openid email profile',
    },
  };
}

const listFrom = (value: string | undefined, fallback: string[]): string[] =>
  value === undefined || value.trim() === '' ? fallback : value.split(/[\s,]+/).filter(Boolean);

export function cspConfig(env: NodeJS.ProcessEnv = process.env): CspConfig {
  return {
    styleOrigins: listFrom(env.CSP_STYLE_ORIGINS, ['https://fonts.googleapis.com']),
    fontOrigins: listFrom(env.CSP_FONT_ORIGINS, ['https://fonts.gstatic.com']),
    development: env.NODE_ENV === 'development',
  };
}

// Next.js inlines NEXT_PUBLIC_ values at build time only when they are read by their full name.
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/**
 * A path of this app as the browser must request it, for what Next.js does not prefix itself:
 * files in public/, and the redirect targets given to Auth.js, which adds only the origin.
 */
export const withBasePath = (path: string): string => `${BASE_PATH}${path}`;

export const publicConfig: PublicConfig = {
  basePath: BASE_PATH,
  apiBasePath: withBasePath('/api/runtime'),
  features: {
    attachments: process.env.NEXT_PUBLIC_FEATURE_ATTACHMENTS === 'true',
  },
  stream: {
    reconnectAttempts: numberFrom(process.env.NEXT_PUBLIC_STREAM_RECONNECT_ATTEMPTS, 5),
    reconnectDelayMs: numberFrom(process.env.NEXT_PUBLIC_STREAM_RECONNECT_DELAY_MS, 500),
    idleTimeoutMs: numberFrom(process.env.NEXT_PUBLIC_STREAM_IDLE_TIMEOUT_MS, 45_000),
    cancelWaitMs: numberFrom(process.env.NEXT_PUBLIC_STREAM_CANCEL_WAIT_MS, 3_000),
  },
  paging: {
    sessions: 20,
    messages: 50,
    gridRows: 50,
    chartRows: 100,
  },
  searchDebounceMs: 300,
  copiedNoticeMs: 2_000,
  gridHeightPx: 360,
  chartHeightPx: 320,
};
