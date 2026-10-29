import { storageFor, target } from './support/env';
import { expect, lastAnswer, needs, startChat, test } from './support/test';

test.use({ storageState: storageFor('e2e-bob') });

/** The e2e server's readings: 120 rows, `kwh = (index * 37) % 1000`. */
const KWH = Array.from({ length: 120 }, (_, index) => (index * 37) % 1000);

test('[U-05] a report renders its markdown, grid and chart, live and after a reload', async ({ page, agents, axe }) => {
  needs(agents, 'report');
  test.skip(target() === 'dev', 'needs the scripted report workflow');
  await startChat(page, 'report', 'Weekly usage report');
  const answer = lastAnswer(page);
  await expect(answer).toContainText('The table and chart show Plant A using the most energy.');
  await expect(answer.locator('strong')).toHaveText('Plant A');
  for (const view of ['live', 'saved'] as const) {
    if (view === 'saved') await page.reload();
    await expect(page.getByText('Weekly readings')).toBeVisible();
    const grid = page.getByRole('grid');
    await expect(grid.getByRole('columnheader', { name: 'Site' })).toBeVisible();
    await expect(grid.getByRole('columnheader', { name: 'kWh' })).toBeVisible();
    await expect(grid.getByRole('row')).not.toHaveCount(0);
    const chart = page.getByRole('img', { name: 'kWh by site' });
    await expect(chart.locator('svg')).toBeVisible();
  }
  expect(await axe()).toEqual([]);
});

test('[U-06] the grid pages and sorts through /v1/datasets', async ({ page, agents }) => {
  needs(agents, 'report');
  test.skip(target() === 'dev', 'needs the scripted report workflow');
  await startChat(page, 'report', 'Weekly usage report again');
  const grid = page.getByRole('grid');
  await expect(grid.getByRole('row').nth(1)).toBeVisible();
  const cell = (row: number, column: string) => grid.locator(`[row-index="${row}"] [col-id="${column}"]`);
  await expect(cell(0, 'kwh')).toHaveText(String(KWH[0]));

  // The next page is the dataset's page 2.
  const page2 = page.waitForRequest((item) => /\/v1\/datasets\/[^?]+\?page=2&pageSize=25/.test(item.url()));
  await page.getByRole('button', { name: 'Next Page' }).click();
  await page2;
  await expect(cell(25, 'kwh')).toHaveText(String(KWH[25]));

  // Sorting asks the runtime to sort the whole dataset: ascending, then descending.
  const ascending = page.waitForRequest((item) => item.url().includes('sort=kwh') && !item.url().includes('kwh%3Adesc'));
  await grid.getByRole('columnheader', { name: 'kWh' }).click();
  await ascending;
  const descending = page.waitForRequest((item) => item.url().includes('sort=kwh%3Adesc'));
  await grid.getByRole('columnheader', { name: 'kWh' }).click();
  await descending;
  await expect(cell(0, 'kwh')).toHaveText(String(Math.max(...KWH)));
});
