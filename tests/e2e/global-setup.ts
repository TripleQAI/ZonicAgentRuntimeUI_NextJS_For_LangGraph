import fs from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { AUTH_DIR, USERS, target } from './support/env';

const COOKIE = 'authjs.session-token';
const HOUR = 3600;

/**
 * Signs the test users in. Against the fakes: an Auth.js session cookie per user holding the e2e
 * server's access token, encrypted with the UI's e2e cookie secret, exactly what a real sign-in
 * stores. Against dev: one real sign-in through the OIDC provider's hosted page.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0]!.use.baseURL!;
  if (target() === 'dev') return signInOnDev(baseURL);

  const { tokens } = JSON.parse(fs.readFileSync(process.env.E2E_TOKENS_FILE!, 'utf8')) as {
    tokens: Record<string, string>;
  };
  const host = new URL(baseURL).hostname;
  for (const user of USERS) {
    const now = Math.floor(Date.now() / 1000);
    const value = await encode({
      secret: process.env.E2E_AUTH_SECRET!,
      salt: COOKIE,
      maxAge: 8 * HOUR,
      token: {
        sub: user,
        name: user,
        email: `${user}@example.test`,
        accessToken: tokens[user],
        expiresAt: now + HOUR,
      },
    });
    const state = {
      cookies: [
        { name: COOKIE, value, domain: host, path: '/', expires: now + 8 * HOUR, httpOnly: true, secure: false, sameSite: 'Lax' as const },
      ],
      origins: [],
    };
    fs.writeFileSync(path.join(AUTH_DIR, `${user}.json`), JSON.stringify(state, null, 2));
  }
}

/** The dev target: a real sign-in with E2E_USERNAME and E2E_PASSWORD on the provider's page. */
async function signInOnDev(baseURL: string): Promise<void> {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) throw new Error('E2E_TARGET=dev needs E2E_BASE_URL, E2E_USERNAME and E2E_PASSWORD');
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with TripleQ AI' }).click();
  await page.locator('input[name="username"]:visible').fill(username);
  await page.locator('input[name="password"]:visible').fill(password);
  await page.locator('[type="submit"]:visible, button[name="signInSubmitButton"]:visible').first().click();
  await page.waitForURL((url) => url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/login'));
  await page.context().storageState({ path: path.join(AUTH_DIR, 'dev.json') });
  await browser.close();
}
