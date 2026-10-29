import { devAgentName, scripted, storageFor } from './support/env';
import { answered, composer, expect, needs, test } from './support/test';

test.use({ storageState: storageFor('e2e-alice') });

/**
 * A multi-turn chat with a real model (targets `dev` and `local`): the builder's Travel Concierge
 * template, whose LLM router, research agent and trip-planning swarm call public APIs (Open-Meteo,
 * Frankfurter, Nager.Date) through the MCP server. Each turn builds on the earlier ones: "there"
 * must resolve to the city of turn 2. Real answers vary, so the checks are what any good answer has.
 */
const TURNS: { ask: string; has: RegExp[] }[] = [
  { ask: 'Hi! What can you help me with?', has: [/trip|travel|weather/i] },
  { ask: 'What will the weather be like in Lisbon over the next three days?', has: [/Lisbon/i, /\d/] },
  { ask: 'And how many euros would 500 US dollars be right now?', has: [/EUR|€|euro/i, /\d/] },
  { ask: 'Great. Plan a two-day trip there for this coming weekend; I pay in USD.', has: [/Lisbon/i, /USD|\$/i] },
];
/** A turn's longest wait: a trip plan runs four swarm members on the real model. */
const TURN_MS = 240_000;
/** What only the router's JSON or a result object would put in the chat. */
const NOT_CHAT = /"intent"\s*:|"standaloneQuestion"|^\s*\{/;

test('a multi-turn chat with the Travel Concierge: follow-ups use the earlier turns, tools and the swarm answer, and the chat is saved', async ({ page, agents }) => {
  needs(agents, 'concierge');
  test.skip(scripted(), 'needs a real model and the public APIs');
  test.setTimeout(TURNS.length * TURN_MS);
  const answer = page.getByRole('article', { name: 'Agent' });

  await page.goto('/');
  await page
    .getByRole('button')
    .filter({ has: page.getByText(devAgentName('concierge') ?? 'Travel Concierge', { exact: true }) })
    .first()
    .click();
  const answers: string[] = [];
  for (const [index, turn] of TURNS.entries()) {
    await composer(page).fill(turn.ask);
    await composer(page).press('Enter');
    if (index === 0) await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('article', { name: 'You' }).nth(index)).toHaveText(turn.ask);
    // The new answer exists before its saved version (with the actions) is awaited.
    await expect(answer).toHaveCount(index + 1, { timeout: 30_000 });
    const text = await answered(page, TURN_MS);
    for (const pattern of turn.has) expect(text, `turn ${index + 1}: ${text}`).toMatch(pattern);
    expect(text, `turn ${index + 1} shows data, not an answer`).not.toMatch(NOT_CHAT);
    answers.push(text);
  }

  // The swarm's turn: its steps show the members' tools and the handoff to the writer.
  await answer.last().getByRole('link', { name: 'Run details' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('succeeded');
  const steps = (await page.getByRole('list', { name: 'Steps' }).getByRole('listitem').allTextContents()).join('\n');
  expect(steps).toContain('trip_planning_team');
  expect(steps).toMatch(/itinerary_writer/);
  expect(steps).toMatch(/weather_forecast|exchange_rate|public_holidays/);
  await page.goBack();

  // Reopened, the chat shows every turn from the saved messages, in order.
  await page.reload();
  await expect(page.getByRole('article', { name: 'You' })).toHaveText(TURNS.map((turn) => turn.ask));
  await expect(answer).toHaveCount(TURNS.length);
  for (const [index, text] of answers.entries())
    expect((await answer.nth(index).innerText()).trim()).toBe(text);
});
