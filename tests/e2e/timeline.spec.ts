import { storageFor, target } from './support/env';
import { expect, lastAnswer, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-bob') });

test('[U-08] the run timeline shows the swarm steps in order with member names and the handoff', async ({ page, agents, axe }) => {
  needs(agents, 'support');
  test.skip(target() === 'dev', 'needs the scripted swarm');
  await startChat(page, 'support', 'I was charged twice for invoice 7');
  await expect(lastAnswer(page)).toContainText('We refunded the duplicate charge on invoice 7.');
  await lastAnswer(page).getByRole('link', { name: 'Run details' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('succeeded');
  const steps = page.getByRole('list', { name: 'Steps' }).getByRole('listitem');
  const texts = await steps.allTextContents();
  const order = ['support_team (swarm)', 'Agent triage', 'Handoff from triage to billing', 'Agent billing'];
  const positions = order.map((label) => texts.findIndex((text) => text.includes(label)));
  expect(positions.every((position) => position >= 0), JSON.stringify(texts)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(await axe()).toEqual([]);
});
