import { storageFor, target } from './support/env';
import { agentCard, answered, expect, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-alice') });

/** Records every Content Security Policy violation the page reports. */
async function recordViolations(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
}
const violations = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

test('[X-07] pages carry a CSP with a nonce and no inline scripts; chat, grid and chart run without a violation', async ({ page, agents }) => {
  needs(agents, 'chat');
  await recordViolations(page);
  const home = await page.goto('/');
  const policy = home!.headers()['content-security-policy']!;
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  // The nonce changes per request.
  const again = (await page.goto('/'))!.headers()['content-security-policy']!;
  expect(again).not.toBe(policy);
  await expect(agentCard(page, 'chat')).toBeVisible();

  await startChat(page, 'chat', 'Which site used the most?');
  await answered(page);
  expect(await violations(page)).toEqual([]);

  if (target() === 'fakes' && agents.report) {
    await startChat(page, 'report', 'Show the weekly readings');
    await expect(page.getByRole('grid').getByRole('columnheader', { name: 'Site' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'kWh by site' }).locator('svg')).toBeVisible();
    await answered(page);
    expect(await violations(page)).toEqual([]);
  }
});

test('a signed-out visit goes to the sign-in page, which has the CSP too, and comes back to a path', async ({ browser }) => {
  // Signed out: an empty session, not the file's signed-in user.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/runs/00000000-0000-0000-0000-000000000000?tab=trace');
  // A path, not a URL: behind a load balancer the request's own host is the container's.
  expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe('/runs/00000000-0000-0000-0000-000000000000?tab=trace');
  const login = await page.goto('/login');
  expect(login!.headers()['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  await context.close();
});
