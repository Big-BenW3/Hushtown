import { expect, test, type Page } from '@playwright/test';
import { closeAll, fillLobby, peekRole, phaseOf, type Seat } from './helpers';

/** Sends a chat message in the visible chat room. */
async function say(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'SEND' }).click();
}

test.describe('chat rooms', () => {
  test('the wait room is shared by everyone and renders text safely', async ({ browser }) => {
    const { seats } = await fillLobby(browser, 5);
    const [a, b, c] = seats as [Seat, Seat, Seat];

    await say(b.page, 'hello town');
    for (const seat of seats) await expect(seat.page.getByRole('log').getByText('hello town')).toBeVisible();

    // Markup is shown as plain text and never executed.
    const payload = '<img src=x onerror="window.__pwned=1">';
    await say(c.page, payload);
    await expect(a.page.getByRole('log').getByText(payload, { exact: true })).toBeVisible();
    expect(await a.page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await a.page.locator('.chat__log img').count()).toBe(0);

    await closeAll(seats);
  });

  test('a blank message cannot be sent and a long one is capped by the input', async ({ browser }) => {
    const { seats } = await fillLobby(browser, 5);
    const page = seats[0]?.page as Page;
    await page.getByRole('textbox', { name: 'Message' }).fill('   ');
    await expect(page.getByRole('button', { name: 'SEND' })).toBeDisabled();
    const max = Number(await page.getByRole('textbox', { name: 'Message' }).getAttribute('maxlength'));
    expect(max).toBeGreaterThan(0);
    await closeAll(seats);
  });

  test('the mafia den is private to the mafia and closes at dawn', async ({ browser }) => {
    // Two mafia need a town of eight.
    const { seats } = await fillLobby(browser, 8);
    await seats[0]?.page.getByRole('button', { name: 'BEGIN THE NIGHT' }).click();
    for (const seat of seats) await expect.poll(() => phaseOf(seat.page)).toBe('role');

    const roles = await Promise.all(seats.map((s) => peekRole(s.page)));
    const mafia = seats.filter((_, i) => roles[i] === 'Mafia');
    const others = seats.filter((_, i) => roles[i] !== 'Mafia');
    expect(mafia).toHaveLength(2);

    for (const seat of seats) await expect.poll(() => phaseOf(seat.page)).toBe('night');

    const [m1, m2] = mafia as [Seat, Seat];
    const den = (seat: Seat) => seat.page.getByRole('region', { name: 'The Den' });
    await expect(den(m1)).toBeVisible();
    await expect(den(m2)).toBeVisible();
    for (const seat of others) await expect(den(seat)).toHaveCount(0);

    await say(m1.page, 'psst, take Efe');
    await expect(den(m2).getByText('psst, take Efe')).toBeVisible();
    for (const seat of others) await expect(seat.page.getByText('psst, take Efe')).toHaveCount(0);

    // By day the den is gone for everyone and the town square is open.
    for (const seat of seats) await expect.poll(() => phaseOf(seat.page), { timeout: 30_000 }).toMatch(/dawn|day|end/);
    await expect(den(m1)).toHaveCount(0);
    await closeAll(seats);
  });
});
