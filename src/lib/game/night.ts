import { pick } from './rng';
import type { DetectiveResult, NightOutcome, Player, Rng } from './types';

/**
 * Settles the night.
 *
 * - Living mafia each pick a target; the most-picked target dies, ties are
 *   settled at random, and no picks means nobody is attacked.
 * - A doctor's save cancels the kill.
 * - A detective's target is investigated regardless of who dies.
 *
 * Mutates `players` (kills the victim) and returns the outcome plus any new
 * detective result.
 */
export function resolveNight(
  players: Player[],
  round: number,
  rng: Rng,
): { outcome: NightOutcome; detective: DetectiveResult | null } {
  const living = players.filter((p) => p.alive);

  const tally = new Map<string, number>();
  for (const mafioso of living.filter((p) => p.role === 'mafia')) {
    if (mafioso.nightTarget) tally.set(mafioso.nightTarget, (tally.get(mafioso.nightTarget) ?? 0) + 1);
  }

  let attacked: string | null = null;
  if (tally.size > 0) {
    const top = Math.max(...tally.values());
    const leaders = [...tally.entries()].filter(([, count]) => count === top).map(([id]) => id);
    attacked = pick(leaders, rng);
  }

  const doctor = living.find((p) => p.role === 'doctor');
  const saved = attacked !== null && doctor?.nightTarget === attacked;
  const victimId = attacked !== null && !saved ? attacked : null;

  if (victimId) {
    const victim = players.find((p) => p.id === victimId);
    if (victim) victim.alive = false;
  }

  let detective: DetectiveResult | null = null;
  const sleuth = living.find((p) => p.role === 'detective');
  if (sleuth?.nightTarget) {
    const target = players.find((p) => p.id === sleuth.nightTarget);
    if (target) {
      detective = { round, targetId: target.id, targetName: target.name, isMafia: target.role === 'mafia' };
    }
  }

  return { outcome: { round, victimId, saved }, detective };
}
