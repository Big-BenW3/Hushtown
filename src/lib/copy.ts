/** Player-facing copy that is shared between screens. */
import type { Role } from '@/lib/game/types';

export interface RoleCopy {
  label: string;
  tagline: string;
  /** CSS custom property colour used on the role card. */
  tone: 'blood' | 'bone' | 'green';
}

export const ROLE_COPY: Record<Role, RoleCopy> = {
  mafia: {
    label: 'Mafia',
    tagline: 'Every night, you and your partners pick someone to kill. Every day, you lie better than they do.',
    tone: 'blood',
  },
  doctor: {
    label: 'Doctor',
    tagline: 'Each night, pick one soul to protect. Guess right and the town wakes without a grave.',
    tone: 'bone',
  },
  detective: {
    label: 'Detective',
    tagline: 'Each night, check one player and learn if they are mafia. Proving it is the hard part.',
    tone: 'green',
  },
  townsperson: {
    label: 'Townsperson',
    tagline: 'No powers. Just a mouth, a vote and a hunch about who is sweating.',
    tone: 'bone',
  },
};

export const MODE_COPY = {
  classic: { label: 'Classic', hint: 'Full length nights and talks.' },
  quick: { label: 'Quick', hint: 'Short nights and votes.' },
  silent: { label: 'Silent', hint: 'No free text by day. Reactions only.' },
} as const;

export const REACTIONS = [
  { key: 'liar', label: 'LIAR!', tone: 'bone' },
  { key: 'trust', label: 'TRUST', tone: 'green' },
  { key: 'sus', label: 'SUS', tone: 'bone' },
  { key: 'shutup', label: 'SHUT UP', tone: 'red' },
] as const;

/** Formats seconds as m:ss. */
export function mmss(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
