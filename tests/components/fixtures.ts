/** Builds real player views from the real engine, so component tests render what the server would send. */
import { vi } from 'vitest';
import type { Action, Phase, Player, PlayerView } from '@/lib/game/types';
import { viewFor } from '@/lib/game/view';
import { makeAtNight, makeLobby, makeStarted, type Game } from '../helpers';

export { makeAtNight, makeLobby, makeStarted };
export type { Game };

export function viewOf(game: Game, player: Player): PlayerView {
  const view = viewFor(game.room, player.id, game.ctx);
  if (!view) throw new Error('player not in room');
  return view;
}

/** A `send` spy that reports success, like a healthy server. */
export function makeSend(result = true) {
  return vi.fn<(action: Action) => Promise<boolean>>(async () => result);
}

function tryAct(game: Game, player: Player, action: Action): void {
  try {
    game.act(player, action);
  } catch {
    /* the engine rejects actions that do not fit the phase; the driver just tries the next one */
  }
}

/**
 * Drives the game with a simple script (mafia kill the first townsperson, everyone skips talk and votes
 * for the first other player) until `target` is reached. The script is deterministic.
 */
export function advanceTo(game: Game, target: Phase): Game {
  for (let step = 0; step < 200 && game.room.phase !== target; step++) {
    for (const p of game.players.filter((x) => x.alive)) {
      if (game.room.phase === target) break;
      const others = game.players.filter((x) => x.alive && x.id !== p.id);
      switch (game.room.phase) {
        case 'lobby':
          tryAct(game, p, { type: 'start' });
          break;
        case 'role':
          tryAct(game, p, { type: 'ready' });
          break;
        case 'night': {
          const victim = game.players.find((x) => x.alive && x.role !== 'mafia');
          if (p.role === 'mafia' && victim) tryAct(game, p, { type: 'night', targetId: victim.id });
          else if (others[0]) tryAct(game, p, { type: 'night', targetId: p.role === 'doctor' ? p.id : others[0].id });
          tryAct(game, p, { type: 'lock' });
          break;
        }
        case 'dawn':
        case 'verdict':
          tryAct(game, p, { type: 'ack' });
          break;
        case 'day':
          tryAct(game, p, { type: 'skip' });
          break;
        case 'vote':
          if (others[0]) tryAct(game, p, { type: 'vote', targetId: others[0].id });
          break;
        default:
          break;
      }
    }
    if (game.room.phase !== target) game.wait(3);
  }
  if (game.room.phase !== target) throw new Error(`could not reach ${target}; stuck in ${game.room.phase}`);
  return game;
}
