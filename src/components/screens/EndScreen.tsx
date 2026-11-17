'use client';

import { ROLE_COPY } from '@/lib/copy';
import { cx } from '../ui';
import type { ScreenProps } from './types';

export function EndScreen({ view, send }: ScreenProps) {
  const end = view.end;
  if (!end) return null;
  const mafiaWon = end.winner === 'mafia';
  const youWon = mafiaWon ? view.you.role === 'mafia' : view.you.role !== 'mafia';

  return (
    <div className={cx('screen end phase-enter', mafiaWon ? 'end--mafia' : 'end--town')}>
      <svg className="end__drips" viewBox="0 0 390 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 H390 V26 Q380 26 378 44 Q376 26 360 26 Q350 26 348 76 Q346 26 320 26 Q300 26 296 56 Q292 26 260 26 Q240 26 238 38 Q234 26 200 26 Q180 26 176 110 Q172 26 140 26 Q110 26 108 52 Q104 26 70 26 Q50 26 48 84 Q44 26 20 26 Q6 26 0 40 Z" />
      </svg>

      <p className="eyebrow end__kicker">{youWon ? 'You won' : 'You lost'} · after {view.round} {view.round === 1 ? 'night' : 'nights'}</p>
      <h1 className="display end__title flicker">
        THE <br />
        <span className="red end__who">{mafiaWon ? 'MAFIA' : 'TOWN'}</span>
        <br />
        WINS
      </h1>

      <section aria-label="Who was who">
        <p className="eyebrow">Who was who</p>
        <ul className="roster">
          {end.roles.map((r) => (
            <li key={r.id} className={cx('roster__row', !r.alive && 'is-dead', r.role === 'mafia' && 'is-mafia')}>
              <span className="roster__name">{r.name}</span>
              <span className={cx('tag', r.role === 'mafia' && 'tag--blood')}>{ROLE_COPY[r.role].label}</span>
            </li>
          ))}
        </ul>
      </section>

      <ol className="timeline" aria-label="What happened">
        {end.timeline.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>

      {view.you.isHost ? (
        <button type="button" className="btn btn--block" onClick={() => void send({ type: 'again' })}>
          PLAY AGAIN
        </button>
      ) : (
        <p className="muted small center" role="status">Waiting for the host to start another town.</p>
      )}
      <button type="button" className="btn btn--link" onClick={() => void send({ type: 'leave' })}>
        LEAVE TOWN
      </button>
    </div>
  );
}
