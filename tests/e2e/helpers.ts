import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Seat {
  name: string;
  context: BrowserContext;
  page: Page;
}

/** Reads the current phase straight from the DOM so bots react to what a player really sees. */
export async function phaseOf(page: Page): Promise<string | null> {
  return page.locator('[data-phase]').first().getAttribute('data-phase').catch(() => null);
}

/** Opens a fresh browser context (separate storage, so a separate player). */
export async function newSeat(browser: Browser, name: string, viewport = { width: 1366, height: 800 }): Promise<Seat> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { name, context, page };
}

/** Host creates a town through the real UI and returns the four-letter code. */
export async function createTown(seat: Seat): Promise<string> {
  await seat.page.goto('/play?create=1');
  await seat.page.getByLabel('Your name').fill(seat.name);
  await seat.page.getByRole('button', { name: 'START A TOWN' }).click();
  await seat.page.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = seat.page.url().split('/').pop() ?? '';
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

/** Guest joins an existing town through the real UI. */
export async function joinTown(seat: Seat, code: string): Promise<void> {
  await seat.page.goto(`/play?code=${code}`);
  await seat.page.getByLabel('Your name').fill(seat.name);
  await seat.page.getByRole('button', { name: 'ENTER THE TOWN' }).click();
  await seat.page.waitForURL(`**/r/${code}`);
}

/** Builds a lobby of `count` players (first is host). */
export async function fillLobby(browser: Browser, count: number, viewport?: { width: number; height: number }): Promise<{ seats: Seat[]; code: string }> {
  const names = ['Ada', 'Bola', 'Chidi', 'Dayo', 'Efe', 'Femi', 'Gozie', 'Hauwa'];
  const host = await newSeat(browser, names[0] ?? 'Host', viewport);
  const code = await createTown(host);
  const seats = [host];
  for (let i = 1; i < count; i++) {
    const seat = await newSeat(browser, names[i] ?? `Player${i}`, viewport);
    await joinTown(seat, code);
    seats.push(seat);
  }
  await expect(host.page.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeEnabled();
  return { seats, code };
}

/**
 * Holds the role card to reveal it, then returns the role label.
 * The label is captured with a MutationObserver because the last player to look moves the game on,
 * which removes the card from the page almost immediately.
 */
export async function peekRole(page: Page): Promise<string> {
  const label = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'HOLD TO LOOK');
        if (!button) return reject(new Error('Hold button not found'));
        const read = () => document.querySelector('.role__name')?.textContent ?? null;
        const done = (value: string) => {
          observer.disconnect();
          window.dispatchEvent(new Event('pointerup'));
          resolve(value);
        };
        const observer = new MutationObserver(() => {
          const value = read();
          if (value) done(value);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        setTimeout(() => reject(new Error('Role never appeared')), 5000);
      }),
  );
  return label.trim();
}

/**
 * Takes whatever action the current phase asks of a player. Returns true when it did something.
 * The bots are intentionally simple: they exist to push a real game to its end through the UI.
 */
export async function act(page: Page, expected?: string | null, seatIndex = 0): Promise<boolean> {
  const phase = await phaseOf(page);
  // Callers that observed a phase earlier pass it in; if the game has moved on, doing nothing is safer
  // than acting on a screen the caller never looked at.
  if (expected !== undefined && phase !== expected) return false;
  const click = async (name: string | RegExp) => {
    const button = page.getByRole('button', { name }).first();
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) return false;
    await button.click({ timeout: 2000 }).catch(() => undefined);
    return true;
  };

  switch (phase) {
    case 'role': {
      const hold = page.getByRole('button', { name: 'HOLD TO LOOK' });
      if (await hold.isVisible().catch(() => false)) {
        await hold.dispatchEvent('pointerdown').catch(() => undefined);
        await page.evaluate(() => window.dispatchEvent(new Event('pointerup'))).catch(() => undefined);
        return true;
      }
      return false;
    }
    case 'night': {
      const options = page.getByRole('radio');
      if ((await options.count()) === 0) return false;
      const lock = page.getByRole('button', { name: 'LOCK IT IN' });
      if (!(await lock.isVisible().catch(() => false)) || !(await lock.isEnabled().catch(() => true))) {
        // Different seats pick different targets so that nights end both with and without a death.
        const index = seatIndex % (await options.count());
        await options.nth(index).click({ timeout: 2000 }).catch(() => undefined);
      }
      return click('LOCK IT IN');
    }
    case 'dawn':
      return click('FACE THE TOWN');
    case 'verdict':
      return click('CONTINUE');
    case 'day':
      return click('SKIP TO THE VOTE');
    case 'vote': {
      const options = page.getByRole('radio');
      if ((await options.count()) === 0) return false;
      await options.first().click({ timeout: 2000 }).catch(() => undefined);
      return click('CAST VOTE');
    }
    default:
      return false;
  }
}

/** Runs every bot until all of them see the end screen (or the time budget runs out). */
export async function playToEnd(seats: Seat[], budgetMs = 100_000): Promise<void> {
  const deadline = Date.now() + budgetMs;
  let lastLog = '';
  while (Date.now() < deadline) {
    const phases = await Promise.all(seats.map((s) => phaseOf(s.page)));
    if (process.env.HUSHTOWN_E2E_TRACE) {
      const line = phases.join(',');
      if (line !== lastLog) console.warn(new Date().toISOString().slice(17, 23), line);
      lastLog = line;
    }
    if (phases.every((p) => p === 'end')) return;
    await Promise.all(seats.map((s, i) => act(s.page, phases[i], i).catch(() => false)));
    await seats[0]?.page.waitForTimeout(150);
  }
  throw new Error(`Game did not finish in time. Phases: ${(await Promise.all(seats.map((s) => phaseOf(s.page)))).join(',')}`);
}

export async function closeAll(seats: Seat[]): Promise<void> {
  await Promise.all(seats.map((s) => s.context.close()));
}
