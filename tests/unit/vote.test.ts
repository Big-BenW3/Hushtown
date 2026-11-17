import { describe, expect, it } from 'vitest';
import { tallyVotes } from '@/lib/game/vote';
import type { Player } from '@/lib/game/types';
import { makeLobby } from '../helpers';

function setup() {
  const { players } = makeLobby(7);
  return players as [Player, Player, Player, Player, Player, Player, Player];
}

describe('tallyVotes', () => {
  it('hangs the player with the most votes', () => {
    const [a, b, c, d, e] = setup();
    a.vote = c.id;
    b.vote = c.id;
    d.vote = e.id;
    const result = tallyVotes([a, b, c, d, e], 1);
    expect(result.hangedId).toBe(c.id);
    expect(result.counts[c.id]).toBe(2);
  });

  it('spares everyone on a tie', () => {
    const [a, b, c, d] = setup();
    a.vote = c.id;
    b.vote = d.id;
    expect(tallyVotes([a, b, c, d], 1).hangedId).toBeNull();
  });

  it('spares everyone when abstentions match the top vote', () => {
    const [a, b, c, d] = setup();
    a.vote = c.id;
    b.vote = 'abstain';
    expect(tallyVotes([a, b, c, d], 1).hangedId).toBeNull();
  });

  it('hangs when the top vote beats the abstentions', () => {
    const [a, b, c, d, e] = setup();
    a.vote = d.id;
    b.vote = d.id;
    c.vote = 'abstain';
    expect(tallyVotes([a, b, c, d, e], 1).hangedId).toBe(d.id);
  });

  it('treats no votes as nobody hangs', () => {
    const players = setup();
    const result = tallyVotes(players, 1);
    expect(result.hangedId).toBeNull();
    expect(result.votes).toEqual([]);
  });

  it('ignores votes from dead players', () => {
    const [a, b, c, d] = setup();
    a.alive = false;
    a.vote = c.id;
    b.vote = d.id;
    const result = tallyVotes([a, b, c, d], 1);
    expect(result.hangedId).toBe(d.id);
    expect(result.votes).toHaveLength(1);
  });

  it('a single vote is enough when nobody else votes', () => {
    const [a, b, c] = setup();
    a.vote = b.id;
    expect(tallyVotes([a, b, c], 1).hangedId).toBe(b.id);
  });
});
