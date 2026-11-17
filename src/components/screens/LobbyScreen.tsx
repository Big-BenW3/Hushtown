'use client';

import { useState } from 'react';
import { DISCUSSION } from '@/lib/game/config';
import type { Mode } from '@/lib/game/types';
import { MODE_COPY, mmss } from '@/lib/copy';
import { cx, Eyes } from '../ui';
import type { ScreenProps } from './types';

const MODES: Mode[] = ['classic', 'quick', 'silent'];

export function LobbyScreen({ view, send }: ScreenProps) {
  const [copied, setCopied] = useState(false);
  const host = view.you.isHost;
  const count = view.players.length;
  const missing = Math.max(0, view.minPlayers - count);
  const canStart = host && missing === 0;
  const slots = count < view.maxPlayers;

  async function copyLink() {
    const link = `${window.location.origin}/play?code=${view.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', link);
    }
  }

  return (
    <div className="screen lobby phase-enter">
      <div className="lobby__side">
        <p className="eyebrow">Town code</p>
        <h1 className="display lobby__code flicker" aria-label={`Town code ${view.code.split('').join(' ')}`}>
          {view.code}
        </h1>
        <button type="button" className="btn btn--ghost btn--small" onClick={copyLink}>
          {copied ? 'LINK COPIED' : 'SHARE LINK'}
        </button>

        <div className="lobby__block">
          <p className="eyebrow" id="mode-label">How cruel</p>
          <div className="chips" role="radiogroup" aria-labelledby="mode-label">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={view.mode === mode}
                className="chip"
                disabled={!host}
                title={MODE_COPY[mode].hint}
                onClick={() => void send({ type: 'settings', mode })}
              >
                {MODE_COPY[mode].label}
              </button>
            ))}
          </div>
          <p className="muted small">{MODE_COPY[view.mode].hint}</p>
        </div>

        <div className="lobby__block">
          <p className="eyebrow" id="time-label">Discussion time</p>
          <div className="stepper" role="group" aria-labelledby="time-label">
            <button
              type="button"
              className="stepper__btn"
              aria-label="Less time"
              disabled={!host || view.discussionSeconds <= DISCUSSION.min}
              onClick={() => void send({ type: 'settings', discussionSeconds: view.discussionSeconds - DISCUSSION.step })}
            >
              -
            </button>
            <output className="stepper__value display" aria-live="polite">
              {mmss(view.discussionSeconds)}
            </output>
            <button
              type="button"
              className="stepper__btn"
              aria-label="More time"
              disabled={!host || view.discussionSeconds >= DISCUSSION.max}
              onClick={() => void send({ type: 'settings', discussionSeconds: view.discussionSeconds + DISCUSSION.step })}
            >
              +
            </button>
          </div>
        </div>

        <div className="lobby__start">
          <button type="button" className="btn btn--block" disabled={!canStart} onClick={() => void send({ type: 'start' })}>
            BEGIN THE NIGHT
          </button>
          <p className="muted small" role="status">
            {!host
              ? 'Only the host can begin.'
              : missing > 0
                ? `Need ${missing} more soul${missing === 1 ? '' : 's'} to begin.`
                : 'Everyone is here. Begin when ready.'}
          </p>
        </div>
      </div>

      <div className="lobby__souls">
        <h2 className="display title-lg">
          Souls <span className="red">in town</span>
        </h2>
        <p className="scrawl" role="status">
          {count} so far. {view.minPlayers} needed.
        </p>
        <ul className="tags" aria-label="Players">
          {view.players.map((p) => (
            <li key={p.id} className={cx('toe-tag', p.id === view.you.id && 'toe-tag--you', !p.connected && 'toe-tag--away')}>
              <span className="toe-tag__hole" aria-hidden="true" />
              <span className="toe-tag__name">{p.name}</span>
              {p.isHost ? <span className="tag tag--outline">Host</span> : null}
              {p.id === view.you.id ? <span className="tag tag--outline">You</span> : null}
              {!p.connected ? <span className="toe-tag__away">away</span> : null}
            </li>
          ))}
          {slots ? (
            <li className="toe-tag toe-tag--empty">
              <span className="toe-tag__hole" aria-hidden="true" />
              waiting for another soul...
            </li>
          ) : null}
        </ul>
        <Eyes className="lobby__eyes" />
      </div>
    </div>
  );
}
