import type { Player, VerdictOutcome } from './types';

/**
 * Counts the day's votes.
 *
 * Someone hangs only if they have strictly the most votes AND strictly more
 * than the abstentions. Ties (or a tie with abstain) spare everyone.
 */
export function tallyVotes(players: readonly Player[], round: number): VerdictOutcome {
  const counts: Record<string, number> = {};
  let abstain = 0;
  const votes: VerdictOutcome['votes'] = [];

  for (const voter of players.filter((p) => p.alive)) {
    if (voter.vote === null) continue; // Not voting counts as nothing at all.
    votes.push({ voterId: voter.id, targetId: voter.vote });
    if (voter.vote === 'abstain') abstain += 1;
    else counts[voter.vote] = (counts[voter.vote] ?? 0) + 1;
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  const unique = first !== undefined && (second === undefined || first[1] > second[1]);
  const beatsAbstain = first !== undefined && first[1] > abstain;

  return { round, hangedId: unique && beatsAbstain ? first[0] : null, counts, abstain, votes };
}
