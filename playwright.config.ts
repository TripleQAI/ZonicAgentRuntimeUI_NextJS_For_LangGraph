import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite (task U5-10) against the LangGraph runtime (ZonicAgentRuntimeBackend_Python_LangGraph):
 * - `fakes` (default): a runtime with fakes started by the suite. The LangGraph runtime has no such
 *   server yet (its fakes app, tests/api/app.py, runs only inside pytest), so this target stops
 *   with an error until it has one.
 * - `dev`: a running UI at E2E_BASE_URL against the deployed dev runtime; a real sign-in
 *   (E2E_USERNAME, E2E_PASSWORD) and the agents named in E2E_DEV_AGENTS. Tests that need the
 *   scripted workflows are skipped there.
 * - `local`: the multi-turn conversation spec against the runtime started on this machine
 *   (`uv run python -m zonic_runtime.server`, port 8000) at E2E_RUNTIME_URL. This UI is built and
 *   started against it; sign-in is a session cookie holding the access tokens in E2E_TOKENS_FILE
 *   (`{"tokens": {"<user>": "<token>"}}`), from an issuer the runtime trusts.
 */
const target = process.env.E2E_TARGET === 'dev' || process.env.E2E_TARGET === 'local' ? process.env.E2E_TARGET : 'fakes';
if (target === 'fakes')
  throw new Error(
    'E2E_TARGET=fakes needs a LangGraph runtime with fakes, which ZonicAgentRuntimeBackend_Python_LangGraph does not serve yet; use E2E_TARGET=dev or local',
  );
if (target === 'local' && !process.env.E2E_TOKENS_FILE)
  throw new Error('E2E_TARGET=local needs E2E_TOKENS_FILE: access tokens the local LangGraph runtime accepts');
const uiPort = Number(process.env.E2E_UI_PORT ?? 3100);
const baseURL = target === 'dev' ? process.env.E2E_BASE_URL : `http://localhost:${uiPort}`;
const tokensFile = path.resolve(process.env.E2E_TOKENS_FILE ?? 'tests/e2e/.auth/tokens.json');
const runtimeUrl = process.env.E2E_RUNTIME_URL ?? 'http://127.0.0.1:8000';
/** The cookie secret of the UI the suite starts; not a real secret. */
const e2eAuthSecret = 'e2e-only-session-secret-0000000000000000';

process.env.E2E_TARGET = target;
process.env.E2E_TOKENS_FILE = tokensFile;
process.env.E2E_AUTH_SECRET = e2eAuthSecret;

export default defineConfig({
  testDir: 'tests/e2e',
  // The local target runs only the conversation with the real model.
  testMatch: target === 'local' ? /conversation\.spec\.ts/ : /.*\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  // A real model answers slower than a scripted one; both can be overridden.
  timeout: Number(process.env.E2E_TIMEOUT_MS ?? 180_000),
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT_MS ?? 90_000) },
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile-only/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer:
    target === 'dev'
      ? undefined
      : [
          {
            command: `npm run build && npx next start --port ${uiPort}`,
            url: `http://localhost:${uiPort}/login`,
            env: {
              RUNTIME_API_URL: runtimeUrl,
              AUTH_SECRET: e2eAuthSecret,
              AUTH_TRUST_HOST: 'true',
              AUTH_URL: `http://localhost:${uiPort}`,
              AUTH_OIDC_ISSUER: `${runtimeUrl}/no-issuer`,
              AUTH_OIDC_CLIENT_ID: 'e2e',
            },
            reuseExistingServer: false,
            timeout: 300_000,
          },
        ],
});
