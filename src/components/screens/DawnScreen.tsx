'use client';

import { useCountdown } from '@/lib/client/useRoom';
import { Clock, Eyes } from '../ui';
import { AckButton } from './AckButton';
import type { ScreenProps } from './types';

export function DawnScreen({ view, send, clockOffset }: ScreenProps) {
  const seconds = useCountdown(view.deadline, clockOffset);
  const dawn = view.dawn;
  const victimIsYou = dawn?.victimId === view.you.id;

  return (
    <div className="screen dawn phase-enter">
      <div className="screen__head">
        <h1 className="display title-xl dawn__title">
          {dawn?.victimName ? (
            <>
              Someone <br />
              didn&apos;t <br />
              <span className="red">wake up</span>
            </>
          ) : (
            <>
              Everyone <br />
              <span className="red">woke up</span>
            </>
          )}
        </h1>
        <Clock seconds={seconds} />
      </div>

      {dawn?.victimName ? (
        <figure className="grave" aria-label={`Gravestone of ${dawn.victimName}`}>
          <svg viewBox="0 0 230 300" className="grave__stone" role="img" aria-label="A cracked gravestone">
            <path d="M10 300 L10 110 Q10 8 115 8 Q220 8 220 110 L220 300 Z" fill="#8F9A8C" stroke="#C7D1C4" strokeWidth="5" />
            <path d="M150 10 L134 60 L156 92 L132 140" stroke="#0E1410" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M30 250 L52 238 L66 262" stroke="#0E1410" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <figcaption className="grave__text">
            <span className="grave__small">HERE LIES</span>
            <span className="display grave__name">{dawn.victimName}</span>
            <span className="grave__small">FOUND AT DAWN</span>
            <span className="grave__rule" />
            <span className="grave__small">ROLE: UNKNOWN</span>
          </figcaption>
        </figure>
      ) : (
        <div className="calm" aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="64" fill="#C7D1C4" opacity="0.9" />
            <circle cx="82" cy="84" r="10" fill="#9AA596" />
            <circle cx="120" cy="116" r="7" fill="#9AA596" />
          </svg>
        </div>
      )}

      <p className="scrawl dawn__scrawl">{dawn?.victimName ? 'one of you did this' : 'somebody is lying'}</p>
      <p className="dawn__text">
        {dawn?.victimName
          ? victimIsYou
            ? 'It was you. You can still watch, and whisper to the dead.'
            : `${dawn.victimName} was found at dawn. Nobody saw anything. Somebody is lying.`
          : 'Nobody died last night. Either the doctor was lucky or the mafia was not.'}
      </p>

      <div className="dawn__tags">
        <span className="tag tag--lg">{dawn?.alive ?? 0} still breathing</span>
        <span className="tag tag--lg tag--line">Day {view.round} begins</span>
      </div>

      <AckButton view={view} send={send} label="FACE THE TOWN" />
      <Eyes className="dawn__eyes" />
    </div>
  );
}
