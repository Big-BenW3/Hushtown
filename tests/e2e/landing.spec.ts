import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('shows the four sections and the main call to action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('lying');
    await expect(page.getByRole('heading', { name: /Sleep\. Wake\. Accuse\./ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Four faces/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Got a code\?/ })).toBeVisible();
    for (const role of ['Mafia', 'Doctor', 'Detective', 'Townsperson']) {
      await expect(page.getByRole('heading', { name: role, exact: true })).toBeVisible();
    }
  });

  test('START A TOWN opens the create form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'START A TOWN' }).click();
    await expect(page).toHaveURL(/\/play\?create=1/);
    await expect(page.getByRole('button', { name: 'START A TOWN' })).toBeVisible();
    await expect(page.getByLabel('Room code')).toHaveCount(0);
  });

  test('nav anchors jump to their sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'The cast' }).click();
    await expect(page).toHaveURL(/#cast$/);
    await page.getByRole('link', { name: 'Join a town' }).click();
    await expect(page).toHaveURL(/#join$/);
  });

  test('the join strip on the landing page rejects an empty name', async ({ page }) => {
    await page.goto('/');
    await page.locator('#strip-code').fill('abcd');
    await page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(page.locator('.form-error')).toHaveText('Enter a name.');
  });

  for (const [label, viewport] of [
    ['phone', { width: 390, height: 844 }],
    ['laptop', { width: 1366, height: 800 }],
  ] as const) {
    test(`has no horizontal overflow on a ${label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto('/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await context.close();
    });
  }

  test('unknown routes show the fog page', async ({ page }) => {
    const response = await page.goto('/nowhere');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'BACK TO TOWN' })).toBeVisible();
  });
});
