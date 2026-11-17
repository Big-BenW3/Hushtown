'use client';

import { useCountdown } from '@/lib/client/useRoom';
import { phaseSeconds } from '@/lib/game/config';
import { cx, Eyes, livingOthers, nameOf, Ring } from '../ui';
import type { ScreenProps } from './types';

const COPY = {
  kill: { head: ['Pick your', 'victim'], hint: 'If you and your partner disagree, the majority wins. A tie is settled at random.', scrawl: 'eyes closed. mafia only.' },
  save: { head: ['Who gets', 'saved?'], hint: 'Guess the mafia’s target and nobody dies tonight. You may save yourself.', scrawl: 'eyes closed. doctor only.' },
  investigate: { head: ['Who looks', 'guilty?'], hint: 'You will learn if your pick is mafia when the sun rises.', scrawl: 'eyes closed. detective only.' },
} as const;

export function NightScreen({ view, send, clockOffset }: ScreenProps) {
  const seconds = useCountdown(view.deadline, clockOffset);
  const total = phaseSeconds(view.mode, view.discussionSeconds).night;
  const night = view.night;
  const action = night?.action ?? null;

  if (!view.you.alive) return <DeadNight view={view} seconds={seconds} total={total} />;
  if (!action || !night) return <Sleeping view={view} seconds={seconds} total={total} />;

  const copy = COPY[action];
  const allies = new Set(view.allies ?? []);
  // Doctors may save themselves; everyone else picks from the living others.
  const candidates = action === 'save' ? view.players.filter((p) => p.alive) : livingOthers(view);
  const partnerPicks = Object.entries(night.partnerTargets ?? {}).filter(([, target]) => target);

  return (
    <div className="screen night phase-enter">
      <div className="screen__head">
        <div>
          <h1 className="display night__title">Night {view.round}</h1>
          <p className="scrawl">{copy.scrawl}</p>
        </div>
        <Ring seconds={seconds} total={total} />
      </div>

      <h2 className="display title-xl night__ask">
        {copy.head[0]} <span className="red">{copy.head[1]}</span>
      </h2>

      <ul className="picks" role="radiogroup" aria-label="Choose a player">
        {candidates.map((p) => {
          const partnerOnThis = partnerPicks.filter(([, target]) => target === p.id).map(([id]) => nameOf(view, id));
          const isAlly = allies.has(p.id);
          const selected = night.target === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className="pick pick--round"
                disabled={isAlly || night.locked}
                onClick={() => void send({ type: 'night', targetId: p.id })}
              >
                <span className="pick__mark" aria-hidden="true">
                  {selected ? <svg viewBox="0 0 16 16"><path d="M2 8 L6 12 L14 3" fill="none" /></svg> : null}
                </span>
                <span>{p.name}{p.id === view.you.id ? ' (you)' : ''}</span>
                {isAlly ? <span className="pick__note">YOUR PARTNER</span> : null}
                {partnerOnThis.length ? <span className="tag tag--green pick__note">{partnerOnThis.join(', ').toUpperCase()} PICKED THIS</span> : null}
                {selected ? (
                  <svg className="pick__ring" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M16 46 C10 14 120 6 220 10 C330 14 352 40 340 62 C326 86 160 84 60 78 C14 72 8 50 30 30" />
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="night__hint">{copy.hint}</p>

      {night.results?.length ? (
        <div className="notebook" aria-label="Detective notebook">
          <p className="eyebrow">Your notebook</p>
          <ul>
            {night.results.map((r) => (
              <li key={`${r.round}-${r.targetId}`}>
                Night {r.round}: {r.targetName} is <strong className={cx(r.isMafia && 'notebook__bad')}>{r.isMafia ? 'MAFIA' : 'innocent'}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn--block night__lock"
        disabled={!night.target || night.locked}
        onClick={() => void send({ type: 'lock' })}
      >
        {night.locked ? 'LOCKED IN' : 'LOCK IT IN'}
      </button>
      <p className="muted small center">Everyone else sees a dark screen.</p>
      <Eyes className="night__eyes" />
    </div>
  );
}

/** Townspeople simply sleep through the night. */
function Sleeping({ view, seconds, total }: { view: ScreenProps['view']; seconds: number | null; total: number }) {
  return (
    <div className="screen night night--sleep phase-enter">
      <div className="screen__head">
        <div>
          <h1 className="display night__title">Night {view.round}</h1>
          <p className="scrawl">eyes closed. don&apos;t peek.</p>
        </div>
        <Ring seconds={seconds} total={total} />
      </div>
      <div className="sleep">
        <svg className="sleep__moon" viewBox="0 0 200 200" aria-hidden="true">
          <path d="M120 10 A92 92 0 1 0 190 140 A74 74 0 1 1 120 10 Z" fill="#E8DCC0" opacity="0.16" />
        </svg>
        <h2 className="display title-xl">Sleep.</h2>
        <p className="sleep__text">The town is quiet. Something moves in the dark. You will learn what at dawn.</p>
        <Eyes className="sleep__eyes" />
      </div>
    </div>
  );
}

function DeadNight({ view, seconds, total }: { view: ScreenProps['view']; seconds: number | null; total: number }) {
  return (
    <div className="screen night night--sleep phase-enter">
      <div className="screen__head">
        <div>
          <h1 className="display night__title">Night {view.round}</h1>
          <p className="scrawl">you are dead. watch closely.</p>
        </div>
        <Ring seconds={seconds} total={total} />
      </div>
      <div className="sleep">
        <h2 className="display title-xl">
          You <span className="red">fell</span>.
        </h2>
        <p className="sleep__text">The living cannot hear you. Talk with the other dead in the graveyard.</p>
        <p className="muted small">{nameOf(view, view.you.id)}</p>
      </div>
    </div>
  );
}
