import { expect, test } from '@playwright/test';
import { closeAll, createTown, newSeat } from './helpers';

test.describe('joining a town', () => {
  test('requires a name', async ({ page }) => {
    await page.goto('/play');
    await page.getByLabel('Room code').fill('BCDF');
    await page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(page.locator('.form-error')).toHaveText('Enter a name.');
  });

  test('requires a complete room code', async ({ page }) => {
    await page.goto('/play');
    await page.getByLabel('Room code').fill('BC');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(page.locator('.form-error')).toHaveText('Room codes are four letters.');
  });

  test('strips characters that can never appear in a code', async ({ page }) => {
    await page.goto('/play');
    const input = page.getByLabel('Room code');
    await input.fill('a1e!b-c#dxyz');
    // Vowels, digits and punctuation are not in the alphabet; the rest is upper-cased and capped at 4.
    await expect(input).toHaveValue('BCDX');
  });

  test('reports an unknown room without leaking details', async ({ page }) => {
    await page.goto('/play');
    await page.getByLabel('Room code').fill('ZZZZ');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(page.locator('.form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/play/);
    expect(await page.locator('.form-error').textContent()).not.toMatch(/stack|undefined|TypeError/i);
  });

  test('rejects an invalid name from the server', async ({ browser }) => {
    const host = await newSeat(browser, 'Ada');
    const code = await createTown(host);
    const guest = await newSeat(browser, 'x');
    await guest.page.goto(`/play?code=${code}`);
    await guest.page.getByLabel('Your name').fill('a​b'); // zero-width space is refused
    await guest.page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(guest.page.locator('.form-error')).toBeVisible();
    await closeAll([host, guest]);
  });

  test('rejects a duplicate name in the same town', async ({ browser }) => {
    const host = await newSeat(browser, 'Ada');
    const code = await createTown(host);
    const guest = await newSeat(browser, 'ada');
    await guest.page.goto(`/play?code=${code}`);
    await guest.page.getByLabel('Your name').fill('ada');
    await guest.page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(guest.page.locator('.form-error')).toContainText(/taken|already/i);
    await closeAll([host, guest]);
  });

  test('a visitor with no saved seat is sent to the join screen', async ({ page }) => {
    await page.goto('/r/BCDF');
    await expect(page).toHaveURL(/\/play\?code=BCDF/);
    await expect(page.getByLabel('Room code')).toHaveValue('BCDF');
  });

  test('a malformed room code in the URL is a 404', async ({ page }) => {
    const response = await page.goto('/r/not-a-code');
    expect(response?.status()).toBe(404);
  });
});
