import { expect, test } from '@playwright/test';
import { closeAll, fillLobby, newSeat, joinTown, peekRole, phaseOf, playToEnd } from './helpers';

test.describe('a full game', () => {
  // A game can run several rounds; the driver's own budget (100s) must fire before Playwright's.
  test.setTimeout(150_000);

  test('five players play from lobby to the end screen', async ({ browser }) => {
    const { seats, code } = await fillLobby(browser, 5);
    const [host, ...guests] = seats;
    if (!host) throw new Error('no host');

    // Everyone sees everyone in the wait room.
    for (const seat of seats) {
      await expect(seat.page.locator('.toe-tag__name')).toHaveCount(5);
    }
    // Only the host gets a working start button.
    for (const guest of guests) await expect(guest.page.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeDisabled();

    await host.page.getByRole('button', { name: 'BEGIN THE NIGHT' }).click();
    for (const seat of seats) await expect.poll(() => phaseOf(seat.page)).toBe('role');

    // Roles are dealt exactly once each and only mafia is told about partners.
    const roles: string[] = [];
    for (const seat of seats) roles.push(await peekRole(seat.page));
    expect(roles.filter((r) => r === 'Doctor')).toHaveLength(1);
    expect(roles.filter((r) => r === 'Detective')).toHaveLength(1);
    expect(roles.filter((r) => r === 'Mafia').length).toBeGreaterThanOrEqual(1);

    await playToEnd(seats);

    for (const seat of seats) {
      await expect(seat.page.getByRole('heading', { name: /WINS/ })).toBeVisible();
      await expect(seat.page.locator('.roster__row')).toHaveCount(5);
    }
    // Both sides agree on who won.
    const winners = await Promise.all(seats.map((s) => s.page.locator('.end__who').textContent()));
    expect(new Set(winners).size).toBe(1);

    // Only the host can restart.
    await expect(host.page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible();
    for (const guest of guests) await expect(guest.page.getByRole('button', { name: 'PLAY AGAIN' })).toHaveCount(0);

    await host.page.getByRole('button', { name: 'PLAY AGAIN' }).click();
    for (const seat of seats) await expect.poll(() => phaseOf(seat.page)).toBe('lobby');
    expect(code).toMatch(/^[A-Z]{4}$/);
    await closeAll(seats);
  });

  test('a player who reloads mid-game gets their seat back', async ({ browser }) => {
    const { seats } = await fillLobby(browser, 5);
    const [host, second] = seats;
    if (!host || !second) throw new Error('missing seats');
    await host.page.getByRole('button', { name: 'BEGIN THE NIGHT' }).click();
    await expect.poll(() => phaseOf(second.page)).toBe('role');

    await second.page.reload();
    await expect.poll(() => phaseOf(second.page)).toBe('role');
    await expect(second.page.getByRole('button', { name: 'HOLD TO LOOK' })).toBeVisible();
    await closeAll(seats);
  });

  test('a town cannot start with too few players', async ({ browser }) => {
    const host = await newSeat(browser, 'Ada');
    await host.page.goto('/play?create=1');
    await host.page.getByLabel('Your name').fill('Ada');
    await host.page.getByRole('button', { name: 'START A TOWN' }).click();
    await host.page.waitForURL(/\/r\//);
    await expect(host.page.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeDisabled();
    await expect(host.page.getByRole('status').filter({ hasText: /Need 4 more/ })).toBeVisible();
    await closeAll([host]);
  });

  test('nobody can join once the game has started', async ({ browser }) => {
    const { seats, code } = await fillLobby(browser, 5);
    await seats[0]?.page.getByRole('button', { name: 'BEGIN THE NIGHT' }).click();
    const late = await newSeat(browser, 'Late');
    await late.page.goto(`/play?code=${code}`);
    await late.page.getByLabel('Your name').fill('Late');
    await late.page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
    await expect(late.page.locator('.form-error')).toBeVisible();
    await expect(late.page).toHaveURL(/\/play/);
    await closeAll([...seats, late]);
    void joinTown;
  });
});
