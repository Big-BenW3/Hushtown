import Link from 'next/link';
import { Grain } from '@/components/ui';
import { JoinForm } from '@/components/JoinForm';

const STEPS = [
  { n: '1', title: 'Night', tone: 'one', text: 'Everyone closes their eyes. The mafia whisper in their private den and pick a victim. The doctor saves one soul. The detective checks one liar.' },
  { n: '2', title: 'Dawn', tone: 'two', text: 'The town wakes and counts heads. One gravestone appears with a name on it. Nobody saw anything. Somebody is lying.' },
  { n: '3', title: 'The vote', tone: 'three', text: 'Talk it out in the open square, point fingers, then vote in secret. Whoever hangs is revealed. Wrong guess and the night comes back.' },
] as const;

const CAST = [
  { side: 'The killers', name: 'Mafia', tone: 'mafia', text: 'Wake at night. Pick a victim with your partners in the den. Lie better in the morning.', count: '1 to 3 per town' },
  { side: 'The saviour', name: 'Doctor', tone: 'doctor', text: 'Pick one soul each night to protect. Guess right and the town wakes without a grave.', count: 'Always 1' },
  { side: 'The eyes', name: 'Detective', tone: 'detective', text: 'Check one player each night and learn if they are mafia. Proving it is the hard part.', count: 'Always 1' },
  { side: 'The rest', name: 'Townsperson', tone: 'town', text: 'No powers. Just a mouth, a vote, and a hunch about who is sweating.', count: 'Everyone else' },
] as const;

export default function LandingPage() {
  return (
    <div className="landing">
      <Grain />

      {/* 1. Hero */}
      <header className="hero">
        <svg className="hero__scene" viewBox="0 0 600 700" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <circle cx="380" cy="260" r="210" fill="#B3111B" />
          <circle cx="310" cy="190" r="30" fill="#8E0C14" />
          <circle cx="450" cy="330" r="40" fill="#8E0C14" />
          <circle cx="410" cy="150" r="18" fill="#8E0C14" />
          <path d="M300 700 L316 400 M316 470 L250 400 M316 520 L380 450 M540 700 L526 340 M528 430 L586 360 M532 480 L486 420" stroke="#1C1313" strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M0 640 L60 610 L140 630 L240 590 L360 626 L480 596 L600 630 L600 700 L0 700 Z" fill="#140D0D" />
        </svg>

        <nav className="hero__nav" aria-label="Main">
          <span className="display wordmark">
            Hush<span className="red-t">t</span>own
          </span>
          <div className="hero__links">
            <a href="#how">How it plays</a>
            <a href="#cast">The cast</a>
            <a className="hero__join" href="#join">
              Join a town
            </a>
          </div>
        </nav>

        <div className="hero__copy">
          <p className="eyebrow">The mafia game, built for phones</p>
          <h1 className="display hero__title flicker">
            Someone
            <br />
            here is
            <br />
            <span className="red">lying.</span>
          </h1>
          <p className="hero__lede">
            Five to fifteen friends. One phone each. Roles are dealt in secret, the town sleeps, and by morning someone is dead.
          </p>
          <div className="hero__cta">
            <Link className="btn" href="/play?create=1">
              START A TOWN
            </Link>
            <span className="scrawl">free. no account.</span>
          </div>
        </div>
      </header>

      <div className="tape tape--wide" aria-hidden="true">
        DON&apos;T TRUST ANYONE + DON&apos;T TRUST ANYONE + DON&apos;T TRUST ANYONE + DON&apos;T TRUST ANYONE
      </div>

      {/* 2. How it plays */}
      <section id="how" className="section" aria-labelledby="how-title">
        <p className="eyebrow">How it plays</p>
        <h2 id="how-title" className="display section__title">
          Sleep. Wake. <span className="red">Accuse.</span>
        </h2>
        <div className="steps">
          {STEPS.map((s) => (
            <article key={s.n} className={`step step--${s.tone}`}>
              <span className="display step__n">{s.n}</span>
              <h3 className="display step__title">{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
        <p className="scrawl steps__note">repeat until someone wins</p>
      </section>

      {/* 3. The cast */}
      <section id="cast" className="section section--cast" aria-labelledby="cast-title">
        <p className="eyebrow">The cast</p>
        <h2 id="cast-title" className="display section__title">
          Four faces. <span className="red">One secret.</span>
        </h2>
        <p className="cast__note">
          Roles are shuffled on the server, so nobody gets to pick. Hold your card down to peek, let go to hide it.
        </p>
        <div className="cards">
          {CAST.map((c) => (
            <article key={c.name} className={`card card--${c.tone}`}>
              <p className="eyebrow">{c.side}</p>
              <h3 className="display card__name">{c.name}</h3>
              <hr />
              <p>{c.text}</p>
              <p className="eyebrow card__count">{c.count}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4. Join */}
      <section id="join" className="section section--join" aria-labelledby="join-title">
        <h2 id="join-title" className="display join-cta__title">
          Got a code?
          <br />
          Walk in.
        </h2>
        <div className="join-cta__form">
          <JoinForm strip />
          <ul className="facts">
            <li>No download</li>
            <li>No account</li>
            <li>Secret mafia chat</li>
            <li>Town square for everyone</li>
          </ul>
        </div>
        <p className="join-cta__foot eyebrow">Hushtown. No mercy.</p>
      </section>
    </div>
  );
}
