import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { act, closeAll, fillLobby, phaseOf, type Seat } from './helpers';

const SHOT_DIR = 'test-results/screens';

/** Layout rules that must hold for every screen: nothing spills sideways, phones never need scrolling. */
async function expectCleanLayout(page: Page, mobile: boolean, label: string): Promise<void> {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('.split__pane--main');
    const root = document.documentElement;
    return {
      sideways: root.scrollWidth - root.clientWidth,
      paneOverflow: main ? main.scrollHeight - main.clientHeight : 0,
      pageOverflow: root.scrollHeight - root.clientHeight,
    };
  });
  expect.soft(metrics.sideways, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
  if (mobile) {
    expect.soft(Math.max(metrics.paneOverflow, metrics.pageOverflow), `${label}: vertical scrolling on phone`).toBeLessThanOrEqual(1);
  }
}

/** Plays a whole game, pausing to screenshot and check layout the first time each phase appears. */
async function tour(browser: Parameters<typeof fillLobby>[0], viewport: { width: number; height: number }, tag: string) {
  const mobile = viewport.width < 1024;
  const { seats } = await fillLobby(browser, 5, viewport);
  const watcher = seats[1] as Seat; // a guest, so host-only controls do not hide problems
  const seen = new Set<string>();
  const capture = async (phase: string) => {
    if (seen.has(phase)) return;
    seen.add(phase);
    await watcher.page.waitForTimeout(300); // let entrance animations settle
    await watcher.page.screenshot({ path: `${SHOT_DIR}/${tag}-${phase}.png` });
    await expectCleanLayout(watcher.page, mobile, `${tag}/${phase}`);
  };

  await capture('lobby');
  await seats[0]?.page.getByRole('button', { name: 'BEGIN THE NIGHT' }).click();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const phases = await Promise.all(seats.map((s) => phaseOf(s.page)));
    const current = phases[1];
    // Nobody acts on the first tick of a phase: phases that end when everyone is ready (role reveal,
    // dawn, the skip vote) could otherwise finish before the watcher has photographed them.
    const fresh = current ? !seen.has(current) : false;
    if (current) await capture(current);
    if (phases.every((p) => p === 'end')) break;
    await Promise.all(seats.map((s, i) => (fresh ? Promise.resolve(false) : act(s.page, phases[i], i).catch(() => false))));
    await watcher.page.waitForTimeout(120);
  }
  await closeAll(seats);
  return seen;
}

test.describe('visual tour', () => {
  test.beforeAll(() => mkdirSync(SHOT_DIR, { recursive: true }));

  test('phone: every phase fits on screen without scrolling', async ({ browser }) => {
    const seen = await tour(browser, { width: 390, height: 844 }, 'phone');
    for (const phase of ['lobby', 'role', 'night', 'day', 'vote', 'end']) expect(seen.has(phase), `saw ${phase}`).toBe(true);
  });

  test('desktop: every phase shows the game and chat side by side', async ({ browser }) => {
    const seen = await tour(browser, { width: 1366, height: 800 }, 'desktop');
    for (const phase of ['lobby', 'role', 'night', 'day', 'vote', 'end']) expect(seen.has(phase), `saw ${phase}`).toBe(true);
  });
});
