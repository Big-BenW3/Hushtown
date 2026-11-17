/** Shared test fixtures for engine-level tests. */
import { addPlayer, applyAction, createRoom, tick } from '@/lib/game/engine';
import { seededRng } from '@/lib/game/rng';
import type { Action, EngineContext, Player, Role, Room } from '@/lib/game/types';

/** A controllable context: advance `ctx.now` to simulate time passing. */
export function makeCtx(seed = 1, start = 1_000_000): EngineContext {
  let counter = 0;
  return {
    now: start,
    rng: seededRng(seed),
    newId: () => `p${++counter}`,
    newToken: () => `token-${counter}-${Math.random().toString(36).slice(2)}`,
    timeScale: 1,
  };
}

export interface Game {
  room: Room;
  ctx: EngineContext;
  /** Players in join order. */
  players: Player[];
  /** Applies an action as the given player. */
  act: (player: Player, action: Action) => void;
  /** Moves the clock forward by `seconds` and ticks the room. */
  wait: (seconds: number) => void;
  byRole: (role: Role) => Player[];
  /** First living player who is not one of the excluded players. */
  firstOther: (...excluded: Player[]) => Player;
}

/** Builds a lobby with `count` connected players. Host is the first. */
export function makeLobby(count = 6, seed = 1): Game {
  const ctx = makeCtx(seed);
  const { room, player: host } = createRoom('BCDF', 'Host', ctx);
  const players = [host];
  for (let i = 1; i < count; i++) players.push(addPlayer(room, `Player${i}`, ctx));
  for (const p of players) {
    p.connected = true;
    p.disconnectedAt = null;
  }
  return decorate(room, ctx, players);
}

function decorate(room: Room, ctx: EngineContext, players: Player[]): Game {
  return {
    room,
    ctx,
    players,
    act: (player, action) => applyAction(room, player.id, action, ctx),
    wait: (seconds) => {
      ctx.now += seconds * 1000;
      tick(room, ctx);
    },
    byRole: (role) => players.filter((p) => p.role === role),
    firstOther: (...excluded) => {
      const found = players.find((p) => p.alive && !excluded.includes(p));
      if (!found) throw new Error('no player available');
      return found;
    },
  };
}

/** A lobby that has been started and sits in the role phase. */
export function makeStarted(count = 6, seed = 1): Game {
  const game = makeLobby(count, seed);
  game.act(game.players[0] as Player, { type: 'start' });
  return game;
}

/** Everyone has seen their role and the first night has begun. */
export function makeAtNight(count = 6, seed = 1): Game {
  const game = makeStarted(count, seed);
  for (const p of game.players) game.act(p, { type: 'ready' });
  return game;
}

/** Plays a night where the mafia kill `victim` and nobody else acts, then reaches the day. */
export function nightKill(game: Game, victim: Player): void {
  for (const m of game.byRole('mafia').filter((p) => p.alive)) {
    game.act(m, { type: 'night', targetId: victim.id });
  }
  game.wait(60); // night -> dawn
  for (const p of game.players.filter((x) => x.alive)) game.act(p, { type: 'ack' });
}
