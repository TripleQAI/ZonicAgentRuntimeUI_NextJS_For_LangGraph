import { DEV_QUESTION, scripted, storageFor } from './support/env';
import { answered, expect, lastAnswer, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-alice') });

test('[U-13] copy, feedback and export work and call the API', async ({ page, context, agents, browserName }) => {
  needs(agents, 'chat');
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void ((window as unknown as { __printed: number }).__printed += 1);
  });
  await startChat(page, 'chat', scripted() ? 'Which site used the most?' : DEV_QUESTION);
  const answer = lastAnswer(page);
  if (scripted()) await expect(answer).toContainText('Plant A');
  await answered(page);
  // The live answer gives way to the saved one, which has the actions.
  const actions = answer.getByRole('group', { name: 'Message actions' });
  await expect(actions).toBeVisible();

  await actions.getByRole('button', { name: 'Copy' }).click();
  await expect(actions.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (scripted()) expect(copied).toContain('Plant A used **1,200 kWh**');
  else expect(copied.trim().length).toBeGreaterThan(0);

  const rated = page.waitForResponse((response) => /\/v1\/messages\/[^/]+\/feedback$/.test(response.url()));
  await actions.getByRole('button', { name: 'Helpful', exact: true }).click();
  expect((await rated).status()).toBe(201);
  await expect(actions.getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const commented = page.waitForRequest((request) => /\/feedback$/.test(request.url()) && request.postDataJSON()?.comment);
  await page.getByRole('textbox', { name: 'Tell us more (optional)' }).fill('Exactly what I needed');
  await page.getByRole('button', { name: 'Send', exact: true }).first().click();
  expect((await commented).postDataJSON()).toEqual({ rating: 1, comment: 'Exactly what I needed' });
  await expect(page.getByText('Thanks for your feedback.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Export to PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});
