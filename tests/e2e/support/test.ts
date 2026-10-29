import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { agents, devAgentName, NAMES, target, type Agents } from './env';

/** WCAG 2.1 A and AA, as the component tests run them (case U-12). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export const test = base.extend<{ agents: Agents; axe: () => Promise<string[]> }>({
  // Playwright names a fixture's dependencies by destructuring; `provide` hands the value to the test.
  agents: async ({}, provide) => provide(agents()),
  axe: async ({ page }, provide) =>
    provide(async () => {
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      return results.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      );
    }),
});
export { expect };

/** Skips a test that needs a scripted workflow the dev target has not named. */
export function needs(agentsInUse: Agents, ...keys: (keyof Agents)[]) {
  test.skip(
    keys.some((key) => !agentsInUse[key]),
    `the ${target()} target names no agent for ${keys.join(', ')}`,
  );
}

/** The composer of the page (home or chat). */
export const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });

/** The catalog name of an agent: the scripted workflow's, or the dev agent E2E_DEV_AGENTS names. */
export const agentName = (agent: keyof typeof NAMES): string =>
  target() === 'fakes' ? NAMES[agent] : (devAgentName(agent) ?? NAMES[agent]);

/** An agent's catalog card: the one whose title is exactly its name (names can share a prefix on dev). */
export const agentCard = (page: Page, agent: keyof typeof NAMES) =>
  page.getByRole('button').filter({ has: page.getByText(agentName(agent), { exact: true }) }).first();

/** Picks an agent on the home page and sends the first message; resolves on the new chat's page. */
export async function startChat(page: Page, agent: keyof typeof NAMES, text: string): Promise<string> {
  await page.goto('/');
  await agentCard(page, agent).click();
  await composer(page).fill(text);
  await composer(page).press('Enter');
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** The text the agent's newest answer shows (saved or live). */
export const lastAnswer = (page: Page) => page.getByRole('article', { name: 'Agent' }).last();

/**
 * Waits for the newest answer to be saved (the saved message has the actions); returns its text.
 * `timeout` overrides the expect timeout, for turns longer than one model answer (a swarm's).
 */
export async function answered(page: Page, timeout?: number): Promise<string> {
  const answer = lastAnswer(page);
  await expect(answer.getByRole('group', { name: 'Message actions' })).toBeVisible(timeout ? { timeout } : {});
  return (await answer.innerText()).trim();
}

/** Cuts every connection to the runtime with fakes, as a network drop would (case U-04). */
export async function dropStreams(): Promise<void> {
  const { controlPort } = JSON.parse(fs.readFileSync(process.env.E2E_TOKENS_FILE!, 'utf8')) as { controlPort: number };
  const response = await fetch(`http://127.0.0.1:${controlPort}/drop-streams`, { method: 'POST' });
  if (response.status !== 204) throw new Error(`drop-streams answered ${response.status}`);
}
