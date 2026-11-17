import { describe, expect, it } from 'vitest';
import { resolveNight } from '@/lib/game/night';
import { seededRng } from '@/lib/game/rng';
import type { Player } from '@/lib/game/types';
import { makeStarted } from '../helpers';

/** Six players: finds one of each role plus plain townspeople. */
function setup() {
  const game = makeStarted(8, 2);
  const [m1, m2] = game.byRole('mafia') as [Player, Player];
  const doctor = game.byRole('doctor')[0] as Player;
  const detective = game.byRole('detective')[0] as Player;
  const towns = game.byRole('townsperson');
  return { game, m1, m2, doctor, detective, towns, rng: seededRng(5) };
}

describe('resolveNight', () => {
  it('kills the victim picked by the mafia', () => {
    const { game, m1, m2, towns, rng } = setup();
    const victim = towns[0] as Player;
    m1.nightTarget = victim.id;
    m2.nightTarget = victim.id;
    const { outcome } = resolveNight(game.players, 1, rng);
    expect(outcome.victimId).toBe(victim.id);
    expect(victim.alive).toBe(false);
  });

  it('kills nobody when no mafia picked', () => {
    const { game, rng } = setup();
    const { outcome } = resolveNight(game.players, 1, rng);
    expect(outcome.victimId).toBeNull();
    expect(game.players.every((p) => p.alive)).toBe(true);
  });

  it('follows the majority when mafia disagree', () => {
    const game = makeStarted(12, 4); // three mafia
    const [a, b, c] = game.byRole('mafia') as [Player, Player, Player];
    const [t1, t2] = game.byRole('townsperson') as [Player, Player];
    a.nightTarget = t1.id;
    b.nightTarget = t1.id;
    c.nightTarget = t2.id;
    const { outcome } = resolveNight(game.players, 1, seededRng(1));
    expect(outcome.victimId).toBe(t1.id);
  });

  it('settles a tie at random but only between the tied targets', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const { game, m1, m2, towns } = setup();
      const [t1, t2] = towns as [Player, Player];
      m1.nightTarget = t1.id;
      m2.nightTarget = t2.id;
      const { outcome } = resolveNight(game.players, 1, seededRng(seed));
      expect([t1.id, t2.id]).toContain(outcome.victimId);
      seen.add(outcome.victimId as string);
    }
    expect(seen.size).toBe(2);
  });

  it('lets the doctor cancel the kill', () => {
    const { game, m1, m2, doctor, towns, rng } = setup();
    const victim = towns[0] as Player;
    m1.nightTarget = victim.id;
    m2.nightTarget = victim.id;
    doctor.nightTarget = victim.id;
    const { outcome } = resolveNight(game.players, 1, rng);
    expect(outcome.victimId).toBeNull();
    expect(outcome.saved).toBe(true);
    expect(victim.alive).toBe(true);
  });

  it('does not save when the doctor protects the wrong person', () => {
    const { game, m1, m2, doctor, towns, rng } = setup();
    const [victim, other] = towns as [Player, Player];
    m1.nightTarget = victim.id;
    m2.nightTarget = victim.id;
    doctor.nightTarget = other.id;
    expect(resolveNight(game.players, 1, rng).outcome.victimId).toBe(victim.id);
  });

  it('ignores the doctor if the doctor is dead', () => {
    const { game, m1, m2, doctor, towns, rng } = setup();
    const victim = towns[0] as Player;
    doctor.alive = false;
    doctor.nightTarget = victim.id;
    m1.nightTarget = victim.id;
    m2.nightTarget = victim.id;
    expect(resolveNight(game.players, 1, rng).outcome.victimId).toBe(victim.id);
  });

  it('ignores picks made by dead mafia', () => {
    const { game, m1, m2, towns, rng } = setup();
    m1.alive = false;
    m1.nightTarget = (towns[0] as Player).id;
    m2.nightTarget = (towns[1] as Player).id;
    expect(resolveNight(game.players, 1, rng).outcome.victimId).toBe((towns[1] as Player).id);
  });

  it('gives the detective an accurate result', () => {
    const { game, m1, detective, towns, rng } = setup();
    detective.nightTarget = m1.id;
    expect(resolveNight(game.players, 1, rng).detective).toMatchObject({ targetId: m1.id, isMafia: true });
    detective.nightTarget = (towns[0] as Player).id;
    expect(resolveNight(game.players, 2, rng).detective).toMatchObject({ isMafia: false, round: 2 });
  });

  it('gives no result when the detective is dead or did not pick', () => {
    const { game, detective, m1, rng } = setup();
    expect(resolveNight(game.players, 1, rng).detective).toBeNull();
    detective.nightTarget = m1.id;
    detective.alive = false;
    expect(resolveNight(game.players, 1, rng).detective).toBeNull();
  });
});
