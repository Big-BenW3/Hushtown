'use client';

import { useEffect, useState } from 'react';
import { useCountdown } from '@/lib/client/useRoom';
import { cx, Clock, livingOthers } from '../ui';
import type { ScreenProps } from './types';

export function VoteScreen({ view, send, clockOffset }: ScreenProps) {
  const seconds = useCountdown(view.deadline, clockOffset);
  const vote = view.vote;
  const [choice, setChoice] = useState<string | null>(vote?.yourVote ?? null);
  const [busy, setBusy] = useState(false);

  // Keep the local choice in step if the server value changes (e.g. after reconnect).
  useEffect(() => setChoice(vote?.yourVote ?? null), [vote?.yourVote]);

  const options = livingOthers(view);
  const cast = vote?.yourVote ?? null;
  const unchanged = choice !== null && choice === cast;

  async function submit() {
    if (!choice || busy) return;
    setBusy(true);
    await send({ type: 'vote', targetId: choice });
    setBusy(false);
  }

  const label = !view.you.alive ? 'YOU ARE WATCHING' : unchanged ? 'VOTE CAST' : cast ? 'CHANGE VOTE' : 'CAST VOTE';

  return (
    <div className="screen vote phase-enter">
      <svg className="gallows" viewBox="0 0 140 150" aria-hidden="true">
        <path d="M14 146 L14 10 L110 10 M14 44 L48 10" stroke="#1C1313" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path className="gallows__rope" d="M96 10 L96 54" stroke="#E8DCC0" strokeWidth="3" strokeDasharray="5 3" />
        <ellipse className="gallows__noose" cx="96" cy="64" rx="12" ry="9" fill="none" stroke="#E8DCC0" strokeWidth="3.5" />
      </svg>

      <p className="eyebrow">Day {view.round} · The vote</p>
      <h1 className="display title-xl vote__ask">
        Who <br />
        <span className="red">hangs?</span>
      </h1>

      <div className="vote__timer">
        <Clock seconds={seconds} tag />
        <span className="muted small">
          Votes stay hidden
          <br />
          until the timer ends
        </span>
      </div>

      <ul className="picks" role="radiogroup" aria-label="Vote for a player">
        {options.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="radio"
              aria-checked={choice === p.id}
              className="pick"
              disabled={!view.you.alive}
              onClick={() => setChoice(p.id)}
            >
              <span className="pick__mark" aria-hidden="true">
                {choice === p.id ? <svg viewBox="0 0 20 20"><path d="M3 3 L17 17 M17 3 L3 17" /></svg> : null}
              </span>
              <span>{p.name}</span>
              {cast === p.id ? <span className="pick__note">YOUR VOTE</span> : null}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'abstain'}
            className={cx('pick', 'pick--abstain')}
            disabled={!view.you.alive}
            onClick={() => setChoice('abstain')}
          >
            <span className="pick__mark" aria-hidden="true">
              {choice === 'abstain' ? <svg viewBox="0 0 20 20"><path d="M3 3 L17 17 M17 3 L3 17" /></svg> : null}
            </span>
            <span>Abstain</span>
            <span className="pick__note">SPARE EVERYONE</span>
          </button>
        </li>
      </ul>

      <button type="button" className="btn btn--block vote__cast" disabled={!view.you.alive || !choice || unchanged || busy} onClick={submit}>
        {label}
      </button>
      <p className="muted small center" role="status">
        {vote ? `${vote.voted} OF ${vote.total} HAVE VOTED · A TIE SPARES EVERYONE` : ''}
      </p>
    </div>
  );
}
