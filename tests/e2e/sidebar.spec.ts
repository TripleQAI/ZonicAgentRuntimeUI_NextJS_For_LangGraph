import type { Page } from '@playwright/test';
import { storageFor, target } from './support/env';
import { expect, needs, test } from './support/test';

test.use({ storageState: storageFor('e2e-dave') });
test.describe.configure({ mode: 'serial' });

/** Sessions made through the proxy, as the chat would make them. */
async function createSessions(page: Page, workflow: string, titles: string[]) {
  for (const title of titles) {
    const response = await page.request.post('/api/runtime/v1/sessions', { data: { agenticWorkflowId: workflow, title } });
    expect(response.status()).toBe(201);
  }
}

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Chats' });
const sessionLinks = (page: Page) => sidebar(page).getByRole('list', { name: 'Chats' }).getByRole('link');

test('[U-09] the session list pages, searches, renames, archives and restores', async ({ page, agents, axe }) => {
  needs(agents, 'chat');
  test.skip(target() === 'dev', 'creates sessions for the e2e user');
  await page.goto('/');
  const tag = `run${Date.now()}`;
  await createSessions(page, agents.chat!, [
    ...Array.from({ length: 21 }, (_, index) => `${tag} note ${index + 1}`),
    `${tag} Budget review`,
  ]);
  await page.reload();
  await expect(sessionLinks(page)).toHaveCount(20);
  expect(await axe()).toEqual([]);
  await sidebar(page).getByRole('button', { name: 'Show more' }).click();
  await expect(sessionLinks(page)).not.toHaveCount(20);

  const search = sidebar(page).getByRole('searchbox', { name: 'Search chats' });
  await search.fill(`${tag} Budget`);
  await expect(sessionLinks(page)).toHaveCount(1);
  await expect(sessionLinks(page)).toHaveText(`${tag} Budget review`);

  // Rename with the keyboard.
  await sidebar(page).getByRole('button', { name: `Rename ${tag} Budget review` }).click();
  const name = sidebar(page).getByRole('textbox', { name: 'Chat name' });
  await expect(name).toBeFocused();
  await name.fill(`${tag} Budget 2027`);
  await name.press('Enter');
  await search.fill(`${tag} Budget 2027`);
  await expect(sessionLinks(page)).toHaveText(`${tag} Budget 2027`);

  // Archive, find it under Archived, restore it.
  await sidebar(page).getByRole('button', { name: `Archive ${tag} Budget 2027` }).click();
  await expect(sessionLinks(page)).toHaveCount(0);
  await sidebar(page).getByRole('button', { name: 'Archived' }).click();
  await expect(sessionLinks(page)).toHaveText(`${tag} Budget 2027`);
  await sidebar(page).getByRole('button', { name: `Restore ${tag} Budget 2027` }).click();
  await expect(sessionLinks(page)).toHaveCount(0);
  await sidebar(page).getByRole('button', { name: 'Active' }).click();
  await expect(sessionLinks(page)).toHaveText(`${tag} Budget 2027`);
});

test('[U-09] @mobile on a narrow screen the session list is a drawer', async ({ page, agents, isMobile }) => {
  needs(agents, 'chat');
  test.skip(!isMobile, 'the drawer is the narrow-screen layout');
  await page.goto('/');
  await expect(sidebar(page)).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Open the chat list' });
  await toggle.click();
  await expect(sidebar(page)).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: 'New chat' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sidebar(page)).toBeHidden();
  await expect(toggle).toBeFocused();
  // Choosing a conversation closes the drawer.
  await toggle.click();
  const first = sessionLinks(page).first();
  const title = (await first.textContent()) ?? '';
  await first.click();
  await page.waitForURL(/\/chat\//);
  await expect(sidebar(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});
