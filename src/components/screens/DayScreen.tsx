'use client';

import { useCountdown } from '@/lib/client/useRoom';
import { REACTIONS } from '@/lib/copy';
import type { PublicPlayer } from '@/lib/game/types';
import { cx, Clock, Face, faceColour, nameOf, Scratch } from '../ui';
import type { ScreenProps } from './types';

function tally(count: number): string {
  return count > 0 ? '|'.repeat(Math.min(count, 6)) : '';
}

export function DayScreen({ view, send, clockOffset }: ScreenProps) {
  const seconds = useCountdown(view.deadline, clockOffset);
  const day = view.day;
  const accusations = day?.accusations ?? {};
  const alive = view.players.filter((p) => p.alive);
  const dead = view.players.filter((p) => !p.alive);
  const mostAccused = Math.max(0, ...Object.values(accusations));
  const total = view.discussionSeconds;
  const pct = seconds === null || total <= 0 ? 0 : Math.max(0, Math.min(100, (seconds / total) * 100));
  const canReact = view.chat.writable.includes('town');

  const tag = (p: PublicPlayer): string => {
    if (p.id === view.you.id) return 'THIS IS YOU';
    const n = accusations[p.id] ?? 0;
    if (n > 0 && n === mostAccused) return 'MOST ACCUSED';
    if (n > 0) return `${n} ACCUSE ${n === 1 ? 'THEM' : 'THEM'}`;
    return p.connected ? 'QUIET' : 'AWAY';
  };

  return (
    <div className="screen day phase-enter">
      <div className="screen__head">
        <h1 className="display day__num">Day {view.round}</h1>
        <Clock seconds={seconds} />
      </div>
      <div className="meter" aria-hidden="true">
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>

      <h2 className="display title-lg day__ask">
        Who&apos;s <span className="red">lying?</span>
      </h2>

      {!view.you.alive ? (
        <p className="banner-inline" role="status">
          You are dead. Watch closely, and whisper in the graveyard.
        </p>
      ) : null}

      <ul className="tiles" aria-label="Suspects">
        {alive.map((p) => {
          const n = accusations[p.id] ?? 0;
          const mine = day?.yourAccuse === p.id;
          const isYou = p.id === view.you.id;
          return (
            <li key={p.id} className={cx('tile', n > 0 && n === mostAccused && 'tile--hot', isYou && 'tile--you')}>
              <Face colour={faceColour(p.id)} mood={n >= 2 ? 'angry' : n === 1 ? 'calm' : 'happy'} />
              <div className="tile__body">
                <span className="tile__name">{p.name}</span>
                <span className="tile__tag">{tag(p)}</span>
              </div>
              <div className="tile__foot">
                <span className="tile__tally" aria-label={`${n} accusations`}>
                  {tally(n)}
                </span>
                <button
                  type="button"
                  className="tile__btn"
                  aria-pressed={mine}
                  disabled={isYou || !view.you.alive}
                  onClick={() => void send({ type: 'accuse', targetId: p.id })}
                >
                  {isYou ? 'YOU' : mine ? 'ACCUSED' : 'ACCUSE'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="day__bottom">
        <div className="reactions" role="group" aria-label="Reactions">
          <p className="eyebrow">Say it without saying it</p>
          <div className="reactions__row">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                disabled={!canReact}
                className={cx('quick', r.tone === 'green' && 'quick--green', r.tone === 'red' && 'quick--red')}
                onClick={() => void send({ type: 'react', reaction: r.key })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {dead.length ? (
          <p className="dead-list">
            <span className="eyebrow">The dead</span>{' '}
            {dead.map((p) => (
              <s key={p.id}>{p.name}</s>
            ))}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn--ghost btn--block"
          aria-pressed={day?.youSkip ?? false}
          disabled={!view.you.alive}
          onClick={() => void send({ type: 'skip' })}
        >
          {day?.youSkip ? 'CHANGED MY MIND' : 'SKIP TO THE VOTE'}
        </button>
        <p className="muted small center" role="status">
          {day ? `${day.skipCount} OF ${day.skipNeeded} NEEDED TO SKIP` : ''}
        </p>
        {view.night?.results?.length ? <DetectiveNotes view={view} /> : null}
      </div>
      <Scratch className="corner corner--tr" />
    </div>
  );
}

function DetectiveNotes({ view }: Pick<ScreenProps, 'view'>) {
  return (
    <div className="notebook" aria-label="Detective notebook">
      <p className="eyebrow">Your notebook</p>
      <ul>
        {view.night?.results?.map((r) => (
          <li key={`${r.round}-${r.targetId}`}>
            {nameOf(view, r.targetId)}: <strong className={cx(r.isMafia && 'notebook__bad')}>{r.isMafia ? 'MAFIA' : 'innocent'}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
