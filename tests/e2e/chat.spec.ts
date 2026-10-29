import { DEV_QUESTION, scripted, storageFor, target } from './support/env';
import { agentCard, answered, composer, dropStreams, expect, lastAnswer, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-alice') });

const FINAL = 'Plant A used 1,200 kWh last week, the most of any site.';
/** The question: the scripted model answers it with FINAL; a dev agent answers DEV_QUESTION itself. */
const ASK = scripted() ? 'Which site used the most?' : DEV_QUESTION;
const FIRST = scripted() ? 'How much energy did we use?' : DEV_QUESTION;
const LONG = Array.from({ length: 80 }, (_, index) => `word${index + 1}`).join(' ');

/** Records every text the live answer shows, so a test can see it grow. */
async function recordLiveText(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __live: string[] }).__live = seen;
    new MutationObserver(() => {
      // Only the streamed text: the sections the segments render, not the waiting placeholder.
      const sections = document.querySelectorAll('[data-testid="live-text"] section');
      const text = [...sections].map((section) => section.textContent ?? '').join('');
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

test('[U-01] the new chat offers the agents with the composer ready; choosing one starts a chat with that workflow', async ({ page, agents, axe }) => {
  needs(agents, 'chat');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What can I help you with?' })).toBeVisible();
  // Chat first: one agent is preselected, so the composer is there before any choice.
  await expect(page.getByRole('list', { name: 'Agents' }).getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(composer(page)).toBeVisible();
  expect(await axe()).toEqual([]);
  const card = agentCard(page, 'chat');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await composer(page).fill(FIRST);
  const request = page.waitForRequest((item) => item.url().endsWith('/api/runtime/v1/runs') && item.method() === 'POST');
  await composer(page).press('Enter');
  expect((await request).postDataJSON()).toEqual({
    agenticWorkflowId: agents.chat,
    input: { text: FIRST },
    mode: 'stream',
  });
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('article', { name: 'You' })).toHaveText(FIRST);
  if (target() === 'fakes') await expect(lastAnswer(page)).toContainText(FINAL);
});

test('[U-02] streamed text renders incrementally as markdown and ends as the saved answer', async ({ page, agents }) => {
  needs(agents, 'chat');
  await recordLiveText(page);
  await startChat(page, 'chat', ASK);
  const saved = await answered(page);
  if (scripted()) {
    await expect(lastAnswer(page)).toContainText(FINAL);
    await expect(lastAnswer(page).locator('strong')).toHaveText('1,200 kWh');
  }
  const seen = await page.evaluate(() => (window as unknown as { __live: string[] }).__live);
  // Several growing prefixes of the answer, each one longer: true token streaming. Until its closing
  // `**` arrives, the bold text shows its opening `**`; markdown hides both once it is complete.
  const plain = seen.map((text) => text.replaceAll('*', ''));
  // A real model's chunks are larger than the scripted model's words: at least two steps.
  expect(plain.length).toBeGreaterThan(scripted() ? 3 : 1);
  for (let index = 1; index < plain.length; index += 1)
    expect(plain[index]!.startsWith(plain[index - 1]!.trimEnd()), JSON.stringify(plain)).toBe(true);
  if (scripted()) {
    expect(FINAL.startsWith(plain[0]!.trimEnd()), JSON.stringify(plain)).toBe(true);
    expect(seen.some((text) => text.includes('**1,200'))).toBe(true);
  }
  // The saved message (after a reload) has the same text.
  await page.reload();
  if (scripted()) await expect(lastAnswer(page)).toHaveText(new RegExp(FINAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  else expect(await answered(page)).toBe(saved);
});

test('[U-03] Stop cancels the run; the text so far stays, marked as stopped', async ({ page, agents }) => {
  needs(agents, 'chat');
  test.skip(target() === 'dev', 'needs the scripted long answer');
  await startChat(page, 'chat', 'Write a long report');
  const live = page.getByTestId('live-text');
  await expect(live).toContainText('word5');
  const cancel = page.waitForRequest((item) => /\/v1\/runs\/[^/]+\/cancel$/.test(item.url()));
  await page.getByRole('button', { name: 'Stop' }).click();
  await cancel;
  await expect(page.getByTestId('stopped')).toHaveText('Stopped');
  const kept = await live.textContent();
  expect(kept).toContain('word5');
  expect(kept).not.toContain('word80');
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  // The run is cancelled on the server too.
  await page.getByRole('link', { name: 'Run details' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('cancelled');
});

test('[U-04] after a network drop the stream resumes with Last-Event-ID, without duplicates', async ({ page, agents }) => {
  needs(agents, 'chat');
  test.skip(target() === 'dev', 'drops the connections of the runtime with fakes');
  await startChat(page, 'chat', 'Give me the long answer');
  const live = page.getByTestId('live-text');
  await expect(live).toContainText('word4');
  const reconnect = page.waitForRequest(
    (item) => /\/api\/runtime\/v1\/runs\/[^/]+\/events$/.test(item.url()) && item.headers()['last-event-id'] !== undefined,
  );
  await dropStreams();
  const request = await reconnect;
  expect(Number(request.headers()['last-event-id'])).toBeGreaterThan(0);
  await expect(lastAnswer(page)).toContainText('word80', { timeout: 30_000 });
  const text = (await lastAnswer(page).textContent()) ?? '';
  expect(text).toContain(LONG);
  expect(text.match(/word1 /g)).toHaveLength(1);
});

test('[U-10] errors show the catalog message; Retry only when retryable', async ({ page, agents }) => {
  needs(agents, 'chat');
  await page.goto('/');
  await agentCard(page, 'chat').click();
  // The runtime is busy once (a retryable envelope through the proxy).
  let refused = false;
  await page.route('**/api/runtime/v1/runs', async (route) => {
    if (refused || route.request().method() !== 'POST') return route.continue();
    refused = true;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'OVERLOADED', message: 'The service is busy.', traceId: 'req-503', retryable: true } }),
    });
  });
  await composer(page).fill(ASK);
  await composer(page).press('Enter');
  // Next.js has a route announcer with the alert role too: the error is the one in the page.
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('The agents are busy. Try again in a moment.');
  await expect(alert).toContainText('Reference: req-503');
  await expect(composer(page)).toHaveValue(ASK);
  await alert.getByRole('button', { name: 'Try again' }).click();
  await page.waitForURL(/\/chat\//);
  await page.unroute('**/api/runtime/v1/runs');
  if (scripted()) await expect(lastAnswer(page)).toContainText(FINAL);
  else await answered(page);
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

  // A message over the runtime's input limit: its own message, no Retry.
  await composer(page).fill('x'.repeat(32_001));
  await composer(page).press('Enter');
  const tooLong = page.getByRole('main').getByRole('alert');
  await expect(tooLong).toBeVisible();
  await expect(tooLong.getByRole('button', { name: 'Try again' })).toHaveCount(0);
});

test('[U-11] an expired session prompts for sign-in and keeps the typed input', async ({ page, context, agents }) => {
  needs(agents, 'chat');
  test.skip(target() === 'dev', 'removes the session cookie of the fakes target');
  await startChat(page, 'chat', 'First question');
  await expect(lastAnswer(page)).toContainText('Plant A');
  const cookies = await context.cookies();
  await context.clearCookies();
  await composer(page).fill('A question I do not want to lose');
  await composer(page).press('Enter');
  const prompt = page.getByRole('alertdialog', { name: 'Your session has ended' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('link', { name: 'Sign in again' })).toBeFocused();
  await expect(prompt.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', /callbackUrl=%2Fchat%2F/);
  await expect(composer(page)).toHaveValue('A question I do not want to lose');
  // Signed in again: the page comes back with the draft.
  await context.addCookies(cookies);
  await page.reload();
  await expect(composer(page)).toHaveValue('A question I do not want to lose');
});

test('[U-12] pages pass axe; the answer streams into a polite live region; keyboard only', async ({ page, agents, axe }) => {
  needs(agents, 'chat');
  await page.goto('/');
  expect(await axe()).toEqual([]);
  await agentCard(page, 'chat').focus();
  await page.keyboard.press('Enter');
  await expect(composer(page)).toBeFocused();
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('second line');
  await expect(composer(page)).toHaveValue('First line\nsecond line');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/chat\//);
  const live = page.getByTestId('live-text');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  if (scripted()) await expect(lastAnswer(page)).toContainText('Plant A');
  else await answered(page);
  expect(await axe()).toEqual([]);
  await page.getByRole('link', { name: 'Run details' }).first().click();
  await expect(page.getByRole('heading', { name: 'Run details' })).toBeVisible();
  expect(await axe()).toEqual([]);
});
