import type { Mode, Role } from './types';

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

export const NAME_MIN = 1;
export const NAME_MAX = 16;
/** Letters (any language), numbers, spaces and a few friendly symbols. */
export const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u;

export const CHAT_MAX_LENGTH = 200;
/** Messages kept per channel; older ones are dropped. */
export const CHAT_HISTORY_PER_CHANNEL = 100;
/** Messages sent to a client per channel. */
export const CHAT_VIEW_LIMIT = 60;
/** At most this many messages per window per player. */
export const CHAT_RATE_LIMIT = { max: 6, windowMs: 10_000 } as const;

export const DISCUSSION = { min: 60, max: 300, step: 30, default: 180 } as const;

/** Room codes use consonants only so they never spell a word and are easy to read aloud. */
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE_LENGTH = 4;

/** Phase lengths in seconds. `day` is taken from the room's discussion setting. */
export interface PhaseSeconds {
  role: number;
  night: number;
  dawn: number;
  day: number;
  vote: number;
  verdict: number;
}

export function phaseSeconds(mode: Mode, discussionSeconds: number): PhaseSeconds {
  const quick = mode === 'quick';
  return {
    role: 45,
    night: quick ? 25 : 45,
    dawn: 12,
    day: discussionSeconds,
    vote: quick ? 20 : 30,
    verdict: 12,
  };
}

/** How many of each special role a town of `n` players gets. */
export function roleCounts(n: number): Record<Role, number> {
  const mafia = n >= 12 ? 3 : n >= 8 ? 2 : 1;
  return { mafia, doctor: 1, detective: 1, townsperson: n - mafia - 2 };
}

export const REACTION_TEXT = {
  liar: 'LIAR!',
  trust: 'TRUST',
  sus: 'SUS',
  shutup: 'SHUT UP',
} as const;
