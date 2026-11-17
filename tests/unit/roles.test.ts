import { describe, expect, it } from 'vitest';
import { roleCounts } from '@/lib/game/config';
import { seededRng } from '@/lib/game/rng';
import { assignRoles, buildRoleDeck } from '@/lib/game/roles';
import type { Player } from '@/lib/game/types';
import { makeLobby } from '../helpers';

describe('role counts', () => {
  it.each([
    [5, 1],
    [7, 1],
    [8, 2],
    [11, 2],
    [12, 3],
    [15, 3],
  ])('%i players get %i mafia', (n, mafia) => {
    expect(roleCounts(n).mafia).toBe(mafia);
  });

  it.each([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])('deck for %i players has exactly one doctor, one detective and sums to n', (n) => {
    const deck = buildRoleDeck(n);
    expect(deck).toHaveLength(n);
    expect(deck.filter((r) => r === 'doctor')).toHaveLength(1);
    expect(deck.filter((r) => r === 'detective')).toHaveLength(1);
    expect(deck.filter((r) => r === 'mafia')).toHaveLength(roleCounts(n).mafia);
  });

  it('never gives mafia a majority at the start', () => {
    for (let n = 5; n <= 15; n++) {
      const deck = buildRoleDeck(n);
      expect(deck.filter((r) => r === 'mafia').length * 2).toBeLessThan(n);
    }
  });
});

describe('role assignment', () => {
  it('deals every player exactly one role', () => {
    const game = makeLobby(9);
    assignRoles(game.players, seededRng(7));
    expect(game.players.every((p) => p.role !== null)).toBe(true);
    expect(game.players.filter((p) => p.role === 'mafia')).toHaveLength(2);
  });

  it('is deterministic for a given seed and varies between seeds', () => {
    const rolesFor = (seed: number) => {
      const players = makeLobby(8).players as Player[];
      assignRoles(players, seededRng(seed));
      return players.map((p) => p.role).join(',');
    };
    expect(rolesFor(3)).toBe(rolesFor(3));
    const variety = new Set([1, 2, 3, 4, 5, 6].map(rolesFor));
    expect(variety.size).toBeGreaterThan(1);
  });
});
