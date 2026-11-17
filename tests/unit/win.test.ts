import { describe, expect, it } from 'vitest';
import { checkWinner } from '@/lib/game/win';
import type { Player, Role } from '@/lib/game/types';
import { makeLobby } from '../helpers';

function table(spec: [Role, boolean][]): Player[] {
  const { players } = makeLobby(Math.max(spec.length, 5));
  return spec.map(([role, alive], i) => Object.assign(players[i] as Player, { role, alive }));
}

describe('checkWinner', () => {
  it('town wins when no mafia remain', () => {
    expect(checkWinner(table([['mafia', false], ['doctor', true], ['townsperson', true]]))).toBe('town');
  });

  it('mafia wins when they equal everyone else', () => {
    expect(checkWinner(table([['mafia', true], ['townsperson', true]]))).toBe('mafia');
  });

  it('mafia wins when they outnumber everyone else', () => {
    expect(checkWinner(table([['mafia', true], ['mafia', true], ['townsperson', true]]))).toBe('mafia');
  });

  it('keeps playing while town outnumbers mafia', () => {
    expect(checkWinner(table([['mafia', true], ['townsperson', true], ['doctor', true]]))).toBeNull();
  });

  it('ignores dead players when counting', () => {
    expect(
      checkWinner(table([['mafia', true], ['townsperson', false], ['doctor', false], ['detective', true], ['townsperson', true]])),
    ).toBeNull();
  });
});
