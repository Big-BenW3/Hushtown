import type { ReactNode } from 'react';
import type { PlayerView, PublicPlayer } from '@/lib/game/types';

/** Joins truthy class names. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function nameOf(view: PlayerView, id: string | null | undefined): string {
  return view.players.find((p) => p.id === id)?.name ?? 'Someone';
}

/** Film grain overlay. Purely decorative. */
export function Grain() {
  return <div className="grain" aria-hidden="true" />;
}

/** A pair of blinking eyes watching from the dark. */
export function Eyes({ className }: { className?: string }) {
  return (
    <span className={cx('eyes', className)} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

/** Circular countdown with the time in the middle. */
export function Ring({ seconds, total }: { seconds: number | null; total: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const fraction = seconds === null || total <= 0 ? 1 : Math.max(0, Math.min(1, seconds / total));
  return (
    <div className="ring" role="timer" aria-label={seconds === null ? 'No timer' : `${seconds} seconds left`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="ring__track" cx="42" cy="42" r={radius} fill="none" strokeWidth="7" />
        <circle
          className="ring__bar"
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="clock">{seconds === null ? '' : clock(seconds)}</span>
    </div>
  );
}

export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Text countdown. Turns red and flickers in the last ten seconds. */
export function Clock({ seconds, tag = false }: { seconds: number | null; tag?: boolean }) {
  if (seconds === null) return null;
  return (
    <div
      className={cx('clock', tag && 'clock--tag', seconds <= 10 && 'clock--urgent')}
      role="timer"
      aria-label={`${seconds} seconds left`}
    >
      {clock(seconds)}
    </div>
  );
}

const FACE_COLOURS = ['#e8dcc0', '#c7d1c4', '#d4561a', '#9bd14b', '#d9b36c', '#b9a2d6'];

/** Stable colour per player id so a face stays recognisable between screens. */
export function faceColour(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FACE_COLOURS[hash % FACE_COLOURS.length] as string;
}

const MOUTHS = {
  calm: 'M22 46 L42 46',
  happy: 'M20 42 Q32 52 44 42',
  angry: 'M20 44 L26 40 L32 46 L38 40 L44 44',
} as const;

export function Face({ colour, mood = 'calm', dead = false }: { colour: string; mood?: keyof typeof MOUTHS; dead?: boolean }) {
  return (
    <svg className="face" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill={dead ? '#3a2a2a' : colour} stroke="#0a0707" strokeWidth="3" />
      {dead ? (
        <path d="M16 22 L28 34 M28 22 L16 34 M36 22 L48 34 M48 22 L36 34" stroke="#0a0707" strokeWidth="4" strokeLinecap="round" />
      ) : (
        <path d="M14 26 L28 30 M50 26 L36 30" stroke="#0a0707" strokeWidth="5" strokeLinecap="round" />
      )}
      <path d={MOUTHS[mood]} stroke="#0a0707" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Red scratch marks used as corner decoration. */
export function Scratch({ className }: { className?: string }) {
  return (
    <svg className={cx('scratch-art', className)} viewBox="0 0 90 110" aria-hidden="true">
      <path className="scratch" d="M82 104 L32 4" strokeWidth="6" />
      <path className="scratch" d="M96 96 L50 8" strokeWidth="4" />
    </svg>
  );
}

/** A little tape strip label. */
export function Tape({ children }: { children: ReactNode }) {
  return <div className="tape">{children}</div>;
}

export function livingOthers(view: PlayerView): PublicPlayer[] {
  return view.players.filter((p) => p.alive && p.id !== view.you.id);
}
