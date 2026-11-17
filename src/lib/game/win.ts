import type { Player, Winner } from './types';

/**
 * Town wins when every mafia member is dead.
 * Mafia wins when they equal or outnumber everyone else still alive.
 */
export function checkWinner(players: readonly Player[]): Winner | null {
  const alive = players.filter((p) => p.alive);
  const mafia = alive.filter((p) => p.role === 'mafia').length;
  const others = alive.length - mafia;
  if (mafia === 0) return 'town';
  if (mafia >= others) return 'mafia';
  return null;
}
