// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock, useCountdown } from '@/lib/client/useRoom';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('useCountdown', () => {
  it('counts down to zero and stops there', () => {
    const deadline = Date.now() + 3000; // fixed, like a deadline coming from the server
    const { result } = renderHook(() => useCountdown(deadline, 0));
    expect(result.current).toBe(3);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(0);
  });

  it('returns null when there is no deadline', () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toBeNull();
  });

  it('corrects for a client clock that is behind the server', () => {
    // Server is 5s ahead of this device, so a deadline 8s from "server now" is 8s away on screen too.
    const deadline = Date.now() + 5000 + 8000;
    const { result } = renderHook(() => useCountdown(deadline, 5000));
    expect(result.current).toBe(8);
  });

  it('resets when the deadline changes', () => {
    const { result, rerender } = renderHook(({ d }) => useCountdown(d, 0), { initialProps: { d: Date.now() + 2000 } });
    expect(result.current).toBe(2);
    rerender({ d: Date.now() + 30_000 });
    expect(result.current).toBe(30);
  });
});

describe('formatClock', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(180)).toBe('3:00');
  });

  it('is empty for no timer', () => {
    expect(formatClock(null)).toBe('');
  });
});
