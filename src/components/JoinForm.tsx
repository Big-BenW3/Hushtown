'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { loadName, saveName, saveSession } from '@/lib/client/session';
import { CODE_ALPHABET, CODE_LENGTH, NAME_MAX } from '@/lib/game/config';

interface JoinFormProps {
  initialCode?: string;
  /** Start in "create a new town" mode. */
  startInCreate?: boolean;
  /** Compact horizontal layout used on the landing page. */
  strip?: boolean;
}

const ALLOWED = new Set(CODE_ALPHABET);

/** Keeps only valid room code letters, uppercased. */
export function cleanCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => ALLOWED.has(c)).join('').slice(0, CODE_LENGTH);
}

export function JoinForm({ initialCode = '', startInCreate = false, strip = false }: JoinFormProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(startInCreate);
  const [code, setCode] = useState(cleanCode(initialCode));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Remember the last name used on this device.
  useEffect(() => setName(loadName()), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name.');
    if (!creating && code.length !== CODE_LENGTH) return setError('Room codes are four letters.');

    setBusy(true);
    try {
      const session = creating ? await api.createRoom(trimmed) : await api.joinRoom(code, trimmed);
      saveName(trimmed);
      saveSession(session);
      router.push(`/r/${session.code}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className={strip ? 'join join--strip' : 'join'} onSubmit={submit} noValidate>
      {creating ? null : (
        <div className="field">
          <label className="field__label" htmlFor={strip ? 'strip-code' : 'room-code'}>
            Room code
          </label>
          <input
            id={strip ? 'strip-code' : 'room-code'}
            className="input input--code"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="ABCD"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor={strip ? 'strip-name' : 'player-name'}>
          Your name
        </label>
        <input
          id={strip ? 'strip-name' : 'player-name'}
          className="input input--name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="who are you?"
          maxLength={NAME_MAX}
          autoComplete="nickname"
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn--block join__go" disabled={busy}>
        {busy ? 'ONE MOMENT...' : creating ? 'START A TOWN' : 'ENTER THE TOWN'}
      </button>

      {strip ? null : (
        <button
          type="button"
          className="btn btn--link"
          onClick={() => {
            setCreating((c) => !c);
            setError(null);
          }}
        >
          {creating ? 'or join with a code' : 'or start a new town'}
        </button>
      )}
    </form>
  );
}
