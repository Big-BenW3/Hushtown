// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, loadName, loadSession, saveName, saveSession } from '@/lib/client/session';

const session = { code: 'BCDF', playerId: 'p1', token: 'tok' };

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('session storage', () => {
  it('round-trips a session and is case-insensitive on the code', () => {
    saveSession(session);
    expect(loadSession('BCDF')).toEqual(session);
    expect(loadSession('bcdf')).toEqual(session);
  });

  it('returns null when nothing is saved', () => {
    expect(loadSession('BCDF')).toBeNull();
  });

  it('treats corrupt JSON as signed out', () => {
    window.localStorage.setItem('hushtown:session:BCDF', '{not json');
    expect(loadSession('BCDF')).toBeNull();
  });

  it('ignores entries with the wrong shape or types', () => {
    window.localStorage.setItem('hushtown:session:BCDF', JSON.stringify({ code: 'BCDF', playerId: 5, token: 'x' }));
    expect(loadSession('BCDF')).toBeNull();
  });

  it('does not carry over extra fields from storage', () => {
    window.localStorage.setItem('hushtown:session:BCDF', JSON.stringify({ ...session, admin: true }));
    expect(loadSession('BCDF')).toEqual(session);
  });

  it('clears a session', () => {
    saveSession(session);
    clearSession('BCDF');
    expect(loadSession('BCDF')).toBeNull();
  });

  it('keeps sessions for different towns apart', () => {
    saveSession(session);
    saveSession({ ...session, code: 'GHJK', token: 'other' });
    expect(loadSession('BCDF')?.token).toBe('tok');
    expect(loadSession('GHJK')?.token).toBe('other');
  });

  it('remembers the last name used', () => {
    expect(loadName()).toBe('');
    saveName('Ada');
    expect(loadName()).toBe('Ada');
  });

  it('never throws when storage is blocked or full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => saveSession(session)).not.toThrow();
    expect(() => saveName('Ada')).not.toThrow();
    expect(loadSession('BCDF')).toBeNull();
    expect(loadName()).toBe('');
  });
});
