'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, PlayerView } from '@/lib/game/types';
import { api, ApiError, type Session } from './api';
import { clearSession } from './session';
import { connectRoomStream, type StreamStatus } from './stream';

export interface RoomState {
  view: PlayerView | null;
  status: StreamStatus;
  /** Set when the seat is gone for good (kicked out, room expired). */
  gone: ApiError | null;
  /** Milliseconds to add to `Date.now()` to get server time. */
  clockOffset: number;
  send: (action: Action) => Promise<boolean>;
  /** Latest user-facing error from an action; cleared automatically. */
  error: string | null;
  dismissError: () => void;
}

/** Subscribes to a room and exposes its live view plus a way to act. */
export function useRoom(session: Session | null): RoomState {
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [gone, setGone] = useState<ApiError | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = session?.token;
  const code = session?.code;
  const playerId = session?.playerId;

  useEffect(() => {
    if (!token || !code || !playerId) return;
    const stop = connectRoomStream(
      { code, token, playerId },
      {
        onView: (next) => {
          setView(next);
          setClockOffset(next.serverNow - Date.now());
        },
        onStatus: setStatus,
        onFatal: (fatal) => {
          clearSession(code);
          setGone(fatal);
        },
      },
    );
    return stop;
  }, [code, token, playerId]);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 4000);
  }, []);

  useEffect(() => () => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
  }, []);

  const send = useCallback(
    async (action: Action) => {
      if (!session) return false;
      try {
        await api.action(session, action);
        return true;
      } catch (e) {
        showError(e instanceof ApiError ? e.message : 'Something went wrong.');
        return false;
      }
    },
    [session, showError],
  );

  return { view, status, gone, clockOffset, send, error, dismissError: () => setError(null) };
}

/** Seconds left until `deadline`, ticking at ~4 Hz. Returns null for untimed phases. */
export function useCountdown(deadline: number | null, clockOffset: number): number | null {
  const compute = useCallback(
    () => (deadline === null ? null : Math.max(0, Math.ceil((deadline - (Date.now() + clockOffset)) / 1000))),
    [deadline, clockOffset],
  );
  const [seconds, setSeconds] = useState<number | null>(compute);

  useEffect(() => {
    setSeconds(compute());
    if (deadline === null) return;
    const id = setInterval(() => setSeconds(compute()), 250);
    return () => clearInterval(id);
  }, [compute, deadline]);

  return seconds;
}

export function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null) return '';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
