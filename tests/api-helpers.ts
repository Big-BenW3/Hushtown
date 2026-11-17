import { createLimiters, type ApiDeps, type Limiters } from '@/lib/server/api';
import { RoomStore, type StoreOptions } from '@/lib/server/store';
import { seededRng } from '@/lib/game/rng';

/** A store with a controllable clock and no background timers. */
export function makeStore(overrides: Partial<StoreOptions> = {}) {
  const clock = { now: 1_000_000 };
  const store = new RoomStore({
    now: () => clock.now,
    rng: seededRng(42),
    timeScale: 1,
    ...overrides,
  });
  return { store, clock };
}

export function makeDeps(overrides: Partial<StoreOptions> = {}, limiters?: Partial<Limiters>) {
  const { store, clock } = makeStore(overrides);
  const deps: ApiDeps = { store: () => store, limiters: { ...createLimiters(), ...limiters } };
  return { deps, store, clock };
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function get(path: string, headers: Record<string, string> = {}, signal?: AbortSignal): Request {
  return new Request(`http://localhost${path}`, { method: 'GET', headers, signal });
}

export const params = (code: string) => ({ params: Promise.resolve({ code }) });
export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
