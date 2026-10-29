import { storageFor, target } from './support/env';
import { composer, expect, lastAnswer, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-carol') });

test.beforeEach(() => test.skip(target() === 'dev', 'needs the scripted interrupt workflows'));

test('[U-07] a human-input form from the schema shows errors inline; a valid answer resumes the run', async ({ page, agents, axe }) => {
  needs(agents, 'quantity');
  await startChat(page, 'quantity', 'Order parts');
  const form = page.getByRole('form', { name: 'Input needed' });
  await expect(form).toContainText('How many units should we order?');
  await expect(form.getByRole('heading', { name: 'Input needed' })).toBeFocused();
  await expect(composer(page)).toBeDisabled();
  expect(await axe()).toEqual([]);

  const field = form.getByRole('textbox', { name: 'Your answer' });
  await form.getByRole('button', { name: 'Send answer' }).click();
  await expect(form.getByText('This field is required.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('a dozen');
  await form.getByRole('button', { name: 'Send answer' }).click();
  await expect(form.getByText('Enter a number.')).toBeVisible();

  await field.fill('12');
  const answer = page.waitForRequest((item) => /\/interrupts\/[^/]+$/.test(item.url()) && item.method() === 'POST');
  await form.getByRole('button', { name: 'Send answer' }).click();
  expect((await answer).postDataJSON()).toEqual({ answer: { value: 12 }, mode: 'stream' });
  await expect(lastAnswer(page)).toContainText('Ordering 12 units.');
  await expect(form).toHaveCount(0);
  await expect(composer(page)).toBeEnabled();
});

test('[U-07] an approval approves or rejects, also after the page is reopened', async ({ page, agents }) => {
  needs(agents, 'approval');
  await startChat(page, 'approval', '3 laptops');
  const form = page.getByRole('form', { name: 'Approval needed' });
  await expect(form).toContainText('Approve the purchase: 3 laptops?');
  await form.getByRole('textbox', { name: 'Comment' }).fill('Within budget');
  await form.getByRole('button', { name: 'Approve' }).click();
  await expect(lastAnswer(page)).toContainText('The purchase was approved.');

  // A run left waiting: the reopened chat reads its pending interrupt from the API.
  await startChat(page, 'approval', 'A yacht');
  await expect(page.getByRole('form', { name: 'Approval needed' })).toBeVisible();
  await page.reload();
  const reopened = page.getByRole('form', { name: 'Approval needed' });
  await expect(reopened).toContainText('Approve the purchase: A yacht?');
  await reopened.getByRole('button', { name: 'Reject' }).click();
  await expect(lastAnswer(page)).toContainText('The purchase was rejected.');
});
