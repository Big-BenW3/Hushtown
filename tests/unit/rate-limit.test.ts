import { describe, expect, it } from 'vitest';
import { RateLimiter } from '@/lib/server/rate-limit';

function limiter(capacity = 3, refillPerSecond = 1, maxKeys = 100) {
  const clock = { now: 0 };
  return { clock, rl: new RateLimiter({ capacity, refillPerSecond, maxKeys, now: () => clock.now }) };
}

describe('RateLimiter', () => {
  it('allows a burst up to capacity then blocks', () => {
    const { rl } = limiter(3);
    expect([rl.take('a'), rl.take('a'), rl.take('a'), rl.take('a')]).toEqual([true, true, true, false]);
  });

  it('refills over time', () => {
    const { rl, clock } = limiter(2, 1);
    rl.take('a');
    rl.take('a');
    expect(rl.take('a')).toBe(false);
    clock.now += 1000;
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });

  it('never exceeds capacity however long it rests', () => {
    const { rl, clock } = limiter(2, 1);
    clock.now += 1_000_000;
    expect([rl.take('a'), rl.take('a'), rl.take('a')]).toEqual([true, true, false]);
  });

  it('tracks keys independently', () => {
    const { rl } = limiter(1);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('b')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });

  it('bounds memory by evicting the oldest key', () => {
    const { rl } = limiter(1, 1, 3);
    for (const k of ['a', 'b', 'c', 'd', 'e']) rl.take(k);
    expect(rl.size).toBe(3);
  });
});
