import { describe, expect, it } from 'vitest';
import { actionSchema, playerNameSchema, roomCodeSchema, tokenSchema } from '@/lib/validation/schemas';

describe('playerNameSchema', () => {
  it.each(['Ada', 'Chioma Obi', "O'Neil", 'Zoë', '你好', 'a-b_c.d', 'Player 7'])('accepts %s', (name) => {
    expect(playerNameSchema.parse(name)).toBe(name);
  });

  it('trims and collapses whitespace, including newlines and tabs', () => {
    expect(playerNameSchema.parse('  Ada    Obi  ')).toBe('Ada Obi');
    expect(playerNameSchema.parse('Ada\n\tObi')).toBe('Ada Obi');
  });

  it.each([
    ['empty', ''],
    ['spaces only', '    '],
    ['too long', 'A'.repeat(17)],
    ['script tag', '<script>alert(1)</script>'],
    ['html', '<b>Ada</b>'],
    ['starts with punctuation', '-Ada'],
    ['emoji', 'Ada 😀'],
    ['zero-width space', 'Ada' + String.fromCharCode(0x200b) + 'Obi'],
    ['bidi override', 'Ada' + String.fromCharCode(0x202e) + 'Obi'],
    ['quotes', '"Ada"'],
    ['huge', 'A'.repeat(10_000)],
  ])('rejects %s', (_label, value) => {
    expect(playerNameSchema.safeParse(value).success).toBe(false);
  });

  it('rejects non-strings', () => {
    for (const bad of [undefined, null, 5, {}, ['Ada']]) expect(playerNameSchema.safeParse(bad).success).toBe(false);
  });
});

describe('roomCodeSchema', () => {
  it('normalises case and whitespace', () => {
    expect(roomCodeSchema.parse(' krbt ')).toBe('KRBT');
  });

  it.each(['', 'ABC', 'ABCDE', 'AEIO', '1234', 'KR-T', 'KRBT; DROP', '../..'])('rejects %j', (code) => {
    expect(roomCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('tokenSchema', () => {
  it('accepts a 32 char url-safe token and rejects others', () => {
    expect(tokenSchema.safeParse('a'.repeat(32)).success).toBe(true);
    expect(tokenSchema.safeParse('a'.repeat(31)).success).toBe(false);
    expect(tokenSchema.safeParse('a'.repeat(31) + '!').success).toBe(false);
  });
});

describe('actionSchema', () => {
  const id = 'a1b2c3d4e5f6';

  it.each([
    { type: 'start' },
    { type: 'ready' },
    { type: 'lock' },
    { type: 'ack' },
    { type: 'skip' },
    { type: 'leave' },
    { type: 'again' },
    { type: 'settings', mode: 'quick', discussionSeconds: 90 },
    { type: 'night', targetId: id },
    { type: 'accuse', targetId: id },
    { type: 'accuse', targetId: null },
    { type: 'vote', targetId: id },
    { type: 'vote', targetId: 'abstain' },
    { type: 'chat', channel: 'town', text: 'hello' },
    { type: 'react', reaction: 'liar' },
  ])('accepts %j', (action) => {
    expect(actionSchema.safeParse(action).success).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'teleport' }],
    ['missing type', {}],
    ['extra field', { type: 'start', admin: true }],
    ['bad target format', { type: 'night', targetId: '../../etc' }],
    ['numeric target', { type: 'vote', targetId: 12 }],
    ['bad channel', { type: 'chat', channel: 'admin', text: 'x' }],
    ['missing text', { type: 'chat', channel: 'town' }],
    ['text far too long', { type: 'chat', channel: 'town', text: 'x'.repeat(1001) }],
    ['bad reaction', { type: 'react', reaction: '<img onerror=1>' }],
    ['bad mode', { type: 'settings', mode: 'nightmare' }],
    ['non-integer seconds', { type: 'settings', discussionSeconds: 90.5 }],
    ['seconds out of range', { type: 'settings', discussionSeconds: 9999 }],
    ['not an object', 'start'],
    ['null', null],
  ])('rejects %s', (_label, action) => {
    expect(actionSchema.safeParse(action).success).toBe(false);
  });
});
