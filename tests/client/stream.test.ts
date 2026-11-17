import { describe, expect, it } from 'vitest';
import { backoffDelay, SseParser } from '@/lib/client/stream';

describe('SseParser', () => {
  it('parses a complete event', () => {
    const events = new SseParser().push('id: 1\nevent: state\ndata: {"a":1}\n\n');
    expect(events).toEqual([{ event: 'state', data: '{"a":1}' }]);
  });

  it('reassembles an event split across arbitrary chunks', () => {
    const parser = new SseParser();
    const raw = 'event: state\ndata: {"hello":"world"}\n\n';
    const out = [];
    for (const ch of raw) out.push(...parser.push(ch));
    expect(out).toEqual([{ event: 'state', data: '{"hello":"world"}' }]);
  });

  it('handles several events in one chunk and CRLF line endings', () => {
    const events = new SseParser().push('event: state\r\ndata: 1\r\n\r\nevent: state\r\ndata: 2\r\n\r\n');
    expect(events.map((e) => e.data)).toEqual(['1', '2']);
  });

  it('ignores heartbeat comments', () => {
    expect(new SseParser().push(': ping\n\n')).toEqual([]);
  });

  it('joins multi-line data with newlines', () => {
    expect(new SseParser().push('data: a\ndata: b\n\n')[0]?.data).toBe('a\nb');
  });

  it('defaults the event name to "message"', () => {
    expect(new SseParser().push('data: x\n\n')[0]?.event).toBe('message');
  });

  it('does not emit an event with no data and keeps partial input buffered', () => {
    const parser = new SseParser();
    expect(parser.push('event: state\n\n')).toEqual([]);
    expect(parser.push('data: half')).toEqual([]);
    expect(parser.push('\n\n')[0]?.data).toBe('half');
  });
});

describe('backoffDelay', () => {
  it('doubles from half a second and caps at eight seconds (jitter midpoint)', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 10].map((n) => backoffDelay(n, mid))).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('keeps jitter within +/-25%', () => {
    expect(backoffDelay(2, () => 0)).toBe(1500);
    expect(backoffDelay(2, () => 1)).toBe(2500);
  });

  it('never returns a negative or non-finite delay, even for absurd attempt counts', () => {
    for (const n of [0, 50, 1000]) {
      const d = backoffDelay(n);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });
});
