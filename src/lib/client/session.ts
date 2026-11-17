/**
 * Persists a player's seat in the browser so a refresh or a dropped
 * connection returns them to the same town. Uses localStorage defensively:
 * private modes and blocked storage must never break the game.
 */
import type { Session } from './api';

const key = (code: string) => `hushtown:session:${code.toUpperCase()}`;
const NAME_KEY = 'hushtown:name';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    storage()?.setItem(key(session.code), JSON.stringify(session));
  } catch {
    /* storage full or blocked: the game still works until the tab closes */
  }
}

export function loadSession(code: string): Session | null {
  try {
    const raw = storage()?.getItem(key(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.code === 'string' && typeof parsed.playerId === 'string' && typeof parsed.token === 'string') {
      return { code: parsed.code, playerId: parsed.playerId, token: parsed.token };
    }
  } catch {
    /* corrupt entry: treat as signed out */
  }
  return null;
}

export function clearSession(code: string): void {
  try {
    storage()?.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

export function loadName(): string {
  try {
    return storage()?.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    storage()?.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
