import { describe, expect, it, vi } from 'vitest';
import { GameError } from '@/lib/game/errors';
import type { PlayerView } from '@/lib/game/types';
import { makeStore } from '../api-helpers';

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof GameError ? e.code : 'OTHER';
  }
}

/** Creates a room with `count` players and returns their sessions. */
function fill(store: ReturnType<typeof makeStore>['store'], count: number) {
  const host = store.createRoom('Host');
  const sessions = [host];
  for (let i = 1; i < count; i++) sessions.push(store.join(host.code, `Player${i}`));
  return sessions;
}

describe('RoomStore basics', () => {
  it('creates rooms with unique four-letter consonant codes', () => {
    const { store } = makeStore();
    const codes = new Set(Array.from({ length: 50 }, (_, i) => store.createRoom(`H${i}`).code));
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });

  it('issues unguessable tokens and never repeats them', () => {
    const { store } = makeStore();
    const sessions = fill(store, 10);
    expect(new Set(sessions.map((s) => s.token)).size).toBe(10);
    for (const s of sessions) expect(s.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('rejects unknown rooms and bad tokens', () => {
    const { store } = makeStore();
    const [host] = fill(store, 2) as [ReturnType<typeof store.createRoom>];
    expect(code(() => store.join('ZZZZ', 'Bob'))).toBe('NOT_FOUND');
    expect(code(() => store.act(host.code, 'x'.repeat(32), { type: 'start' }))).toBe('UNAUTHORIZED');
    expect(code(() => store.act('ZZZZ', host.token, { type: 'start' }))).toBe('NOT_FOUND');
    expect(code(() => store.snapshot(host.code, ''))).toBe('UNAUTHORIZED');
  });

  it('does not accept a token from a different room', () => {
    const { store } = makeStore();
    const a = store.createRoom('A');
    const b = store.createRoom('B');
    expect(code(() => store.snapshot(a.code, b.token))).toBe('UNAUTHORIZED');
  });

  it('refuses new rooms past the capacity limit', () => {
    const { store } = makeStore({ maxRooms: 2 });
    store.createRoom('A');
    store.createRoom('B');
    expect(code(() => store.createRoom('C'))).toBe('SERVER_BUSY');
  });

  it('gives a clean error if every code attempt collides', () => {
    const { store } = makeStore({ rng: { int: () => 0 } });
    store.createRoom('A'); // BBBB taken
    expect(code(() => store.createRoom('B'))).toBe('SERVER_BUSY');
  });
});

describe('subscriptions', () => {
  it('sends an immediate snapshot and a new view on every change', () => {
    const { store } = makeStore();
    const [host, p1] = fill(store, 2) as [ReturnType<typeof store.createRoom>, ReturnType<typeof store.createRoom>];
    const seen: PlayerView[] = [];
    store.subscribe(host.code, host.token, (v) => seen.push(v));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.players).toHaveLength(2);

    store.join(host.code, 'Late');
    expect(seen.at(-1)?.players).toHaveLength(3);

    store.act(host.code, p1.token, { type: 'chat', channel: 'lobby', text: 'hello' });
    expect(seen.at(-1)?.chat.messages.lobby?.at(-1)?.text).toBe('hello');
  });

  it('gives each subscriber only their own redacted view', () => {
    const { store } = makeStore();
    const sessions = fill(store, 6);
    const views = new Map<string, PlayerView>();
    for (const s of sessions) store.subscribe(s.code, s.token, (v) => views.set(s.playerId, v));
    store.act(sessions[0]!.code, sessions[0]!.token, { type: 'start' });

    for (const s of sessions) {
      const v = views.get(s.playerId) as PlayerView;
      expect(v.you.id).toBe(s.playerId);
      expect(v.phase).toBe('role');
      const others = v.players.filter((p) => p.id !== s.playerId && p.role !== undefined);
      expect(others.every((p) => p.role === 'mafia' && v.you.role === 'mafia')).toBe(true);
    }
  });

  it('marks players connected and disconnected as streams open and close', () => {
    const { store } = makeStore();
    const [host] = fill(store, 2) as [ReturnType<typeof store.createRoom>];
    const room = store.peek(host.code)!;
    const hostPlayer = room.players[0]!;
    expect(hostPlayer.connected).toBe(false);

    const off1 = store.subscribe(host.code, host.token, () => {});
    const off2 = store.subscribe(host.code, host.token, () => {}); // a second tab
    expect(hostPlayer.connected).toBe(true);
    off1();
    expect(hostPlayer.connected).toBe(true);
    off2();
    expect(hostPlayer.connected).toBe(false);
    off2(); // idempotent
  });

  it('limits open connections per player', () => {
    const { store } = makeStore({ maxConnectionsPerPlayer: 2 });
    const [host] = fill(store, 2) as [ReturnType<typeof store.createRoom>];
    store.subscribe(host.code, host.token, () => {});
    store.subscribe(host.code, host.token, () => {});
    expect(code(() => store.subscribe(host.code, host.token, () => {}))).toBe('RATE_LIMITED');
  });

  it('a subscriber that throws is dropped without affecting anyone else', () => {
    const { store } = makeStore();
    const [host, p1] = fill(store, 3) as [ReturnType<typeof store.createRoom>, ReturnType<typeof store.createRoom>];
    let good = 0;
    let calls = 0;
    store.subscribe(host.code, host.token, () => {
      calls++;
      if (calls > 1) throw new Error('socket closed');
    });
    store.subscribe(host.code, p1.token, () => good++);
    const before = good;

    expect(() => store.join(host.code, 'Newcomer')).not.toThrow();
    expect(good).toBe(before + 1);
    expect(() => store.join(host.code, 'Another')).not.toThrow();
    expect(good).toBe(before + 2);
    expect(store.peek(host.code)!.players[0]!.connected).toBe(false);
  });
});

describe('timers', () => {
  it('tickAll advances phases as the clock moves', () => {
    const { store, clock } = makeStore();
    const sessions = fill(store, 5);
    store.act(sessions[0]!.code, sessions[0]!.token, { type: 'start' });
    clock.now += 46_000;
    store.tickAll();
    expect(store.peek(sessions[0]!.code)!.phase).toBe('night');
  });

  it('pushes timer-driven changes to subscribers', () => {
    const { store, clock } = makeStore();
    const sessions = fill(store, 5);
    const phases: string[] = [];
    store.subscribe(sessions[1]!.code, sessions[1]!.token, (v) => phases.push(v.phase));
    store.act(sessions[0]!.code, sessions[0]!.token, { type: 'start' });
    clock.now += 46_000;
    store.tickAll();
    expect(phases.at(-1)).toBe('night');
  });

  it('one room that throws while ticking does not stop other rooms', () => {
    const { store, clock } = makeStore();
    const a = fill(store, 5);
    const b = fill(store, 5);
    store.act(a[0]!.code, a[0]!.token, { type: 'start' });
    store.act(b[0]!.code, b[0]!.token, { type: 'start' });
    // Corrupt room A so its tick explodes.
    const roomA = store.peek(a[0]!.code)!;
    Object.defineProperty(roomA, 'players', { get() { throw new Error('corrupt'); } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    clock.now += 46_000;
    expect(() => store.tickAll()).not.toThrow();
    expect(store.peek(b[0]!.code)!.phase).toBe('night');
    expect(spy).toHaveBeenCalled();
  });
});

describe('cleanup', () => {
  it('removes a room when its last player leaves', () => {
    const { store } = makeStore();
    const s = store.createRoom('Solo');
    store.act(s.code, s.token, { type: 'leave' });
    expect(store.roomCount).toBe(0);
  });

  it('closes the stream of a player who left while others stay', () => {
    const { store } = makeStore();
    const [host, p1] = fill(store, 3) as [ReturnType<typeof store.createRoom>, ReturnType<typeof store.createRoom>];
    let leaverViews = 0;
    store.subscribe(host.code, p1.token, () => leaverViews++);
    const before = leaverViews;
    store.act(host.code, p1.token, { type: 'leave' });
    store.join(host.code, 'Another');
    expect(leaverViews).toBe(before);
    expect(store.peek(host.code)!.players).toHaveLength(3);
  });

  it('sweeps abandoned rooms but keeps rooms someone is watching', () => {
    const { store, clock } = makeStore({ idleRoomMs: 1000 });
    const idle = store.createRoom('Idle');
    const busy = store.createRoom('Busy');
    store.subscribe(busy.code, busy.token, () => {});
    clock.now += 5000;
    store.sweep();
    expect(store.peek(idle.code)).toBeUndefined();
    expect(store.peek(busy.code)).toBeDefined();
  });

  it('start() and stop() are idempotent', () => {
    const { store } = makeStore({ tickMs: 10_000, sweepMs: 10_000 });
    store.start();
    store.start();
    store.stop();
    store.stop();
  });
});
