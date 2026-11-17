'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@/lib/client/api';
import { clearSession, loadSession } from '@/lib/client/session';
import { useRoom } from '@/lib/client/useRoom';
import type { Action } from '@/lib/game/types';
import { GameView } from './GameView';
import { Eyes, Grain } from './ui';

/** Owns the connection to one room and renders its current phase. */
export function GameRoom({ code }: { code: string }) {
  const router = useRouter();
  // `undefined` while reading storage, `null` when there is no saved seat.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(loadSession(code));
  }, [code]);

  useEffect(() => {
    if (session === null) router.replace(`/play?code=${code}`);
  }, [session, code, router]);

  const room = useRoom(session ?? null);

  const send = useCallback(
    async (action: Action) => {
      const ok = await room.send(action);
      if (ok && action.type === 'leave') {
        clearSession(code);
        router.push('/');
      }
      return ok;
    },
    [room, code, router],
  );

  if (room.gone) {
    return (
      <main className="gate">
        <Grain />
        <h1 className="display title-xl">
          Seat <span className="red">gone</span>
        </h1>
        <p role="alert">{room.gone.message}</p>
        <Link className="btn" href={`/play?code=${code}`}>
          JOIN AGAIN
        </Link>
      </main>
    );
  }

  if (!room.view) {
    return (
      <main className="gate" aria-busy="true">
        <Grain />
        <h1 className="display title-lg">Entering the town...</h1>
        <Eyes />
      </main>
    );
  }

  return (
    <>
      <Grain />
      {room.status === 'reconnecting' ? (
        <div className="banner" role="status">
          CONNECTION LOST. TRYING TO FIND THE TOWN AGAIN...
        </div>
      ) : null}
      <GameView view={room.view} send={send} clockOffset={room.clockOffset} />
      {room.error ? (
        <div className="toast" role="alert" onClick={room.dismissError}>
          {room.error}
        </div>
      ) : null}
    </>
  );
}
