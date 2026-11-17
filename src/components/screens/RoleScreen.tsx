'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ROLE_COPY } from '@/lib/copy';
import { useCountdown } from '@/lib/client/useRoom';
import { cx, Clock, Eyes, nameOf, Scratch } from '../ui';
import type { ScreenProps } from './types';

/** Role reveal. The card only shows while the button is held, so a glance over a shoulder shows nothing. */
export function RoleScreen({ view, send, clockOffset }: ScreenProps) {
  const [held, setHeld] = useState(false);
  const reported = useRef(false);
  const seconds = useCountdown(view.deadline, clockOffset);
  const role = view.you.role;
  const copy = role ? ROLE_COPY[role] : null;

  const press = useCallback(() => {
    setHeld(true);
    if (!reported.current) {
      reported.current = true;
      void send({ type: 'ready' });
    }
  }, [send]);
  const release = useCallback(() => setHeld(false), []);

  // Releasing the pointer anywhere (even off the button) must hide the card.
  useEffect(() => {
    if (!held) return;
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('blur', release);
    };
  }, [held, release]);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      press();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') release();
  };

  const allies = view.allies?.length ? view.allies : view.players.filter((p) => p.role === 'mafia' && p.id !== view.you.id).map((p) => p.id);
  const progress = view.roleProgress;

  return (
    <div className="screen screen--center role phase-enter">
      <div className="role__top">
        <p className="eyebrow">Don&apos;t let anyone see</p>
        <Clock seconds={seconds} tag />
      </div>

      <div className="role__stage">
        <div className="role__shadow" aria-hidden="true" />
        <div className={cx('role__card', held && 'is-held', copy && `tone-${copy.tone}`)} data-revealed={held}>
          {held && copy ? (
            <div className="role__face" aria-live="polite">
              <p className="eyebrow">You are</p>
              <svg className="role__eye" viewBox="0 0 220 120" aria-hidden="true">
                <path d="M10 60 Q110 -14 210 60 Q110 134 10 60 Z" fill="#E8DCC0" />
                <circle cx="110" cy="60" r="32" fill="#B3111B" stroke="#6E0A10" strokeWidth="4" />
                <ellipse cx="110" cy="60" rx="5" ry="25" fill="#0A0707" />
                <path d="M40 30 L34 12 M70 18 L66 2 M110 12 L110 -4 M150 18 L154 2 M180 30 L186 12" stroke="#E8DCC0" strokeWidth="3" strokeLinecap="round" fill="none" />
              </svg>
              <h1 className="display role__name">{copy.label}</h1>
              <p className="role__text">{copy.tagline}</p>
              {role === 'mafia' ? (
                <div className="role__strip">
                  <span className="eyebrow">{allies.length === 1 ? 'Your partner in crime' : allies.length > 1 ? 'Your partners in crime' : 'You work alone'}</span>
                  <strong>{allies.length ? allies.map((id) => nameOf(view, id)).join(', ') : 'Nobody. Trust no one.'}</strong>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="role__back" aria-live="polite">
              <p className="eyebrow">Your role</p>
              <svg className="role__eye role__eye--closed" viewBox="0 0 220 60" aria-hidden="true">
                <path d="M10 30 Q110 70 210 30" stroke="#E8DCC0" strokeWidth="5" fill="none" strokeLinecap="round" />
                <path d="M40 44 L34 58 M80 52 L78 60 M120 54 L120 60 M160 52 L162 60 M180 44 L186 58" stroke="#E8DCC0" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <p className="role__hint">Hold the button below to look. Let go to hide it.</p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={cx('btn btn--block role__hold', held && 'is-pressed')}
        aria-pressed={held}
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={release}
      >
        {held ? 'RELEASE TO HIDE' : 'HOLD TO LOOK'}
      </button>
      <p className="scrawl role__note">forget it. act normal.</p>
      <p className="muted small role__progress" role="status">
        {progress ? `${progress.seen} OF ${progress.total} HAVE LOOKED AT THEIR ROLE` : ''}
      </p>
      <Eyes className="role__eyes" />
      <Scratch className="corner corner--br" />
    </div>
  );
}
