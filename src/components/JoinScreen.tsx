import { Eyes, Grain, Scratch } from './ui';
import { JoinForm } from './JoinForm';

/** The "Join" screen: blood moon, dead trees and the entry form. */
export function JoinScreen({ code, create }: { code?: string; create?: boolean }) {
  return (
    <main className="join-screen">
      <Grain />
      <svg className="join-screen__scene" viewBox="0 0 390 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <circle cx="270" cy="150" r="130" fill="#B3111B" />
        <circle cx="228" cy="116" r="18" fill="#8E0C14" />
        <circle cx="306" cy="190" r="24" fill="#8E0C14" />
        <path d="M30 420 L40 220 M40 270 L0 230 M42 310 L84 266 M340 420 L330 250 M332 300 L372 262" stroke="#1C1313" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M0 396 L40 380 L90 392 L150 370 L230 394 L300 374 L390 392 L390 420 L0 420 Z" fill="#140D0D" />
      </svg>

      <div className="join-screen__content phase-enter">
        <h1 className="display join-screen__title flicker">
          Hush<span className="red-t">t</span>own
        </h1>
        <p className="scrawl join-screen__sub">someone here is lying</p>
        <div className="tape tape--wide" aria-hidden="true">
          DON&apos;T TRUST ANYONE + DON&apos;T TRUST ANYONE + DON&apos;T TRUST ANYONE
        </div>
        <JoinForm initialCode={code} startInCreate={create} />
        <p className="scrawl join-screen__foot">5 to 15 players. no account. no mercy.</p>
      </div>
      <Eyes className="join-screen__eyes" />
      <Scratch className="corner corner--br" />
    </main>
  );
}
