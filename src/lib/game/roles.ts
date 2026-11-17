import { roleCounts } from './config';
import { shuffle } from './rng';
import type { Player, Rng, Role } from './types';

/** Builds the deck of roles for `n` players. Pure and deterministic given counts. */
export function buildRoleDeck(n: number): Role[] {
  const counts = roleCounts(n);
  const deck: Role[] = [];
  (Object.keys(counts) as Role[]).forEach((role) => {
    for (let i = 0; i < counts[role]; i++) deck.push(role);
  });
  return deck;
}

/** Shuffles the deck and deals one role to every player (mutates the players). */
export function assignRoles(players: Player[], rng: Rng): void {
  const deck = shuffle(buildRoleDeck(players.length), rng);
  players.forEach((player, i) => {
    player.role = deck[i] as Role;
  });
}
