/**
 * In-memory room store.
 *
 * Owns every live room, authenticates players, applies actions through the
 * engine, drives timers and fans out per-player views to open event streams.
 *
 * Scaling note: rooms live in this process's memory, so run a single Node
 * process (e.g. `next start`). For multiple instances put rooms behind a
 * shared store with sticky routing; the `RoomStore` surface is deliberately
 * small to make that swap contained.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from '@/lib/game/config';
import { addPlayer, applyAction, createRoom, setConnected, tick } from '@/lib/game/engine';
import { GameError } from '@/lib/game/errors';
import { cryptoRng } from '@/lib/game/rng';
import type { Action, EngineContext, Player, PlayerView, Rng, Room } from '@/lib/game/types';
import { viewFor } from '@/lib/game/view';

export interface StoreOptions {
  maxRooms: number;
  /** Rooms nobody is connected to are removed after this long. */
  idleRoomMs: number;
  /** Connections allowed per player (several tabs are fine, floods are not). */
  maxConnectionsPerPlayer: number;
  timeScale: number;
  tickMs: number;
  sweepMs: number;
  now: () => number;
  rng: Rng;
}

export function defaultStoreOptions(env: NodeJS.ProcessEnv = process.env): StoreOptions {
  const scale = Number(env.HUSHTOWN_TIME_SCALE);
  return {
    maxRooms: Number(env.HUSHTOWN_MAX_ROOMS) > 0 ? Number(env.HUSHTOWN_MAX_ROOMS) : 500,
    idleRoomMs: 30 * 60 * 1000,
    maxConnectionsPerPlayer: 4,
    // Only used by automated tests to shorten phases; clamped so it can never freeze a game.
    timeScale: Number.isFinite(scale) && scale > 0 ? Math.min(1, Math.max(0.02, scale)) : 1,
    tickMs: 500,
    sweepMs: 60_000,
    now: Date.now,
    rng: cryptoRng,
  };
}

type Send = (view: PlayerView) => void;

interface Subscriber {
  playerId: string;
  send: Send;
}

interface Entry {
  room: Room;
  subscribers: Set<Subscriber>;
}

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

const sha = (value: string) => createHash('sha256').update(value).digest();

export class RoomStore {
  private readonly entries = new Map<string, Entry>();
  private tickTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  readonly options: StoreOptions;

  constructor(options: Partial<StoreOptions> = {}) {
    this.options = { ...defaultStoreOptions(), ...options };
  }

  /* -------------------------------- lifecycle -------------------------------- */

  /** Starts background timers. Idempotent. Timers are unref'd so they never block shutdown. */
  start(): void {
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this.tickAll(), this.options.tickMs);
      this.tickTimer.unref?.();
    }
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), this.options.sweepMs);
      this.sweepTimer.unref?.();
    }
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.tickTimer = this.sweepTimer = null;
  }

  get roomCount(): number {
    return this.entries.size;
  }

  private ctx(): EngineContext {
    return {
      now: this.options.now(),
      rng: this.options.rng,
      newId: () => randomBytes(6).toString('hex'),
      newToken: () => randomBytes(24).toString('base64url'),
      timeScale: this.options.timeScale,
    };
  }

  /* --------------------------------- commands -------------------------------- */

  createRoom(hostName: string): Session {
    if (this.entries.size >= this.options.maxRooms) {
      throw new GameError('SERVER_BUSY', 'Hushtown is full right now. Try again in a few minutes.');
    }
    const code = this.newCode();
    const { room, player } = createRoom(code, hostName, this.ctx());
    this.entries.set(code, { room, subscribers: new Set() });
    return { code, playerId: player.id, token: player.token };
  }

  join(code: string, name: string): Session {
    const entry = this.entry(code);
    const player = addPlayer(entry.room, name, this.ctx());
    this.publish(entry);
    return { code, playerId: player.id, token: player.token };
  }

  act(code: string, token: string, action: Action): void {
    const entry = this.entry(code);
    const player = this.authenticate(entry.room, token);
    applyAction(entry.room, player.id, action, this.ctx());
    this.afterChange(entry);
  }

  /**
   * Opens a live view for a player. Sends an immediate snapshot, then one
   * message per change. Returns an `unsubscribe` function the caller MUST
   * call when the connection ends.
   */
  subscribe(code: string, token: string, send: Send): () => void {
    const entry = this.entry(code);
    const player = this.authenticate(entry.room, token);

    const mine = [...entry.subscribers].filter((s) => s.playerId === player.id).length;
    if (mine >= this.options.maxConnectionsPerPlayer) {
      throw new GameError('RATE_LIMITED', 'Too many open connections for this player.');
    }

    const subscriber: Subscriber = { playerId: player.id, send };
    entry.subscribers.add(subscriber);
    if (setConnected(entry.room, player.id, true, this.options.now())) this.publish(entry, subscriber);

    this.deliver(entry, subscriber);

    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.drop(code, subscriber);
    };
  }

  /** Authenticates and returns the current view without subscribing (used by tests and snapshots). */
  snapshot(code: string, token: string): PlayerView {
    const entry = this.entry(code);
    const player = this.authenticate(entry.room, token);
    return viewFor(entry.room, player.id, { now: this.options.now() }) as PlayerView;
  }

  /** Test and diagnostics helper: raw room access. Never expose over HTTP. */
  peek(code: string): Room | undefined {
    return this.entries.get(code)?.room;
  }

  /* --------------------------------- internals ------------------------------- */

  private entry(code: string): Entry {
    const entry = this.entries.get(code);
    if (!entry) throw new GameError('NOT_FOUND', 'No town with that code. Check the letters.');
    return entry;
  }

  /** Constant-time token check so response timing cannot reveal valid tokens. */
  private authenticate(room: Room, token: string): Player {
    const given = sha(token);
    let match: Player | undefined;
    for (const player of room.players) {
      if (timingSafeEqual(given, sha(player.token))) match = player;
    }
    if (!match) throw new GameError('UNAUTHORIZED', 'Your seat in this town is gone. Join again.');
    return match;
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[this.options.rng.int(CODE_ALPHABET.length)];
      if (!this.entries.has(code)) return code;
    }
    throw new GameError('SERVER_BUSY', 'Could not allocate a room code. Try again.');
  }

  /** Publishes new views, and removes the room if everyone left. */
  private afterChange(entry: Entry): void {
    if (entry.room.players.length === 0) {
      this.entries.delete(entry.room.code);
      return;
    }
    this.publish(entry);
  }

  /** Sends each subscriber their own redacted view. A failing subscriber never affects the others. */
  private publish(entry: Entry, skip?: Subscriber): void {
    for (const subscriber of [...entry.subscribers]) {
      if (subscriber !== skip) this.deliver(entry, subscriber);
    }
  }

  private deliver(entry: Entry, subscriber: Subscriber): void {
    try {
      const view = viewFor(entry.room, subscriber.playerId, { now: this.options.now() });
      if (view) subscriber.send(view);
      else this.drop(entry.room.code, subscriber); // The player left the room; end their stream.
    } catch {
      // The stream is dead (client gone). Drop it; others keep working.
      this.drop(entry.room.code, subscriber);
    }
  }

  private drop(code: string, subscriber: Subscriber): void {
    const entry = this.entries.get(code);
    if (!entry || !entry.subscribers.delete(subscriber)) return;
    const stillHere = [...entry.subscribers].some((s) => s.playerId === subscriber.playerId);
    if (!stillHere && setConnected(entry.room, subscriber.playerId, false, this.options.now())) {
      this.publish(entry);
    }
  }

  /** Drives timers for every room. One broken room never stops the others. */
  tickAll(): void {
    const ctx = this.ctx();
    for (const entry of [...this.entries.values()]) {
      try {
        if (tick(entry.room, ctx)) this.afterChange(entry);
      } catch (error) {
        console.error(`[hushtown] tick failed for room ${entry.room.code}`, error);
      }
    }
  }

  /** Removes abandoned rooms so memory use stays bounded. */
  sweep(): void {
    const now = this.options.now();
    for (const [code, entry] of this.entries) {
      const abandoned = entry.subscribers.size === 0 && now - entry.room.updatedAt > this.options.idleRoomMs;
      if (abandoned || entry.room.players.length === 0) this.entries.delete(code);
    }
  }
}

/** One store per process, shared across hot reloads and route modules. */
const GLOBAL_KEY = Symbol.for('hushtown.store');

export function getStore(): RoomStore {
  const holder = globalThis as unknown as Record<symbol, RoomStore | undefined>;
  let store = holder[GLOBAL_KEY];
  if (!store) {
    store = new RoomStore();
    store.start();
    holder[GLOBAL_KEY] = store;
  }
  return store;
}
