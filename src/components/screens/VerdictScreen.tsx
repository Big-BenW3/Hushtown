'use client';

import { useCountdown } from '@/lib/client/useRoom';
import { ROLE_COPY } from '@/lib/copy';
import { Clock, Eyes, nameOf } from '../ui';
import { AckButton } from './AckButton';
import type { ScreenProps } from './types';

/** Shown after the vote: who hung (and what they were) or that the town could not agree. */
export function VerdictScreen({ view, send, clockOffset }: ScreenProps) {
  const seconds = useCountdown(view.deadline, clockOffset);
  const v = view.verdict;
  const hanged = v?.hangedName ?? null;
  const role = v?.hangedRole ? ROLE_COPY[v.hangedRole].label : null;

  return (
    <div className="screen dawn verdict phase-enter">
      <div className="screen__head">
        <h1 className="display title-xl dawn__title">
          {hanged ? (
            <>
              The town
              <br />
              has <span className="red">spoken</span>
            </>
          ) : (
            <>
              Nobody
              <br />
              <span className="red">hangs</span>
            </>
          )}
        </h1>
        <Clock seconds={seconds} />
      </div>

      {hanged ? (
        <figure className="grave grave--hanged" aria-label={`${hanged} was hanged`}>
          <figcaption className="grave__text grave__text--solo">
            <span className="grave__small">HANGED AT NOON</span>
            <span className="display grave__name">{hanged}</span>
            <span className="grave__rule" />
            <span className="grave__small">THEY WERE</span>
            <span className="display verdict__role">{role}</span>
          </figcaption>
        </figure>
      ) : (
        <p className="dawn__text">The town could not agree, so the rope stays dry. The night is coming anyway.</p>
      )}

      <div className="votes" aria-label="Who voted for whom">
        <p className="eyebrow">How it went</p>
        <ul>
          {(v?.votes ?? []).map((vote) => (
            <li key={vote.voterId}>
              {nameOf(view, vote.voterId)} <span className="muted">voted</span>{' '}
              <strong>{vote.targetId === 'abstain' ? 'to abstain' : nameOf(view, vote.targetId)}</strong>
            </li>
          ))}
          {!v?.votes.length ? <li className="muted">Nobody voted.</li> : null}
        </ul>
      </div>

      <AckButton view={view} send={send} label="CONTINUE" />
      <Eyes className="dawn__eyes" />
    </div>
  );
}
