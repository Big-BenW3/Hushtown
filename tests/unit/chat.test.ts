import { describe, expect, it } from 'vitest';
import { addSystemMessage, canRead, canWrite, postReaction, postText, sanitizeText } from '@/lib/game/chat';
import { CHAT_HISTORY_PER_CHANNEL, CHAT_MAX_LENGTH, CHAT_RATE_LIMIT } from '@/lib/game/config';
import { GameError } from '@/lib/game/errors';
import type { Player } from '@/lib/game/types';
import { makeAtNight, makeLobby, nightKill } from '../helpers';

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof GameError ? e.code : 'OTHER';
  }
}

describe('sanitizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeText('  hello \n\t  world  ')).toBe('hello world');
  });

  it('strips control, zero-width and bidi characters', () => {
    const evil = `a${String.fromCharCode(0)}b${String.fromCharCode(0x200b)}c${String.fromCharCode(0x202e)}d`;
    expect(sanitizeText(evil)).toBe('a b c d');
  });

  it('leaves normal unicode, emoji-free text and markup characters untouched (React escapes them)', () => {
    expect(sanitizeText('Olá <b>mundo</b> 你好')).toBe('Olá <b>mundo</b> 你好');
  });
});

describe('lobby chat', () => {
  it('lets everyone post in the wait room', () => {
    const game = makeLobby(5);
    game.act(game.players[1] as Player, { type: 'chat', channel: 'lobby', text: ' who is hosting ' });
    expect(game.room.chat.at(-1)).toMatchObject({ channel: 'lobby', text: 'who is hosting', authorName: 'Player1' });
  });

  it('rejects empty, whitespace-only and over-long messages', () => {
    const game = makeLobby(5);
    const p = game.players[1] as Player;
    expect(code(() => game.act(p, { type: 'chat', channel: 'lobby', text: '   ' }))).toBe('BAD_REQUEST');
    expect(code(() => game.act(p, { type: 'chat', channel: 'lobby', text: 'x'.repeat(CHAT_MAX_LENGTH + 1) }))).toBe('BAD_REQUEST');
    game.act(p, { type: 'chat', channel: 'lobby', text: 'x'.repeat(CHAT_MAX_LENGTH) });
  });

  it('cannot reach channels that do not exist for the phase', () => {
    const game = makeLobby(5);
    const p = game.players[1] as Player;
    expect(code(() => game.act(p, { type: 'chat', channel: 'town', text: 'hi' }))).toBe('FORBIDDEN');
    expect(code(() => game.act(p, { type: 'chat', channel: 'mafia', text: 'hi' }))).toBe('FORBIDDEN');
    expect(code(() => game.act(p, { type: 'chat', channel: 'graveyard', text: 'hi' }))).toBe('FORBIDDEN');
  });
});

describe('rate limiting', () => {
  it('blocks a flood and recovers after the window', () => {
    const game = makeLobby(5);
    const p = game.players[1] as Player;
    for (let i = 0; i < CHAT_RATE_LIMIT.max; i++) game.act(p, { type: 'chat', channel: 'lobby', text: `m${i}` });
    expect(code(() => game.act(p, { type: 'chat', channel: 'lobby', text: 'too many' }))).toBe('RATE_LIMITED');
    game.ctx.now += CHAT_RATE_LIMIT.windowMs + 1;
    game.act(p, { type: 'chat', channel: 'lobby', text: 'fine again' });
  });

  it('is tracked per player', () => {
    const game = makeLobby(5);
    const [a, b] = [game.players[1], game.players[2]] as [Player, Player];
    for (let i = 0; i < CHAT_RATE_LIMIT.max; i++) game.act(a, { type: 'chat', channel: 'lobby', text: `m${i}` });
    game.act(b, { type: 'chat', channel: 'lobby', text: 'still fine' });
  });
});

describe('history cap', () => {
  it('keeps only the newest messages per channel and leaves other channels alone', () => {
    const game = makeLobby(5);
    addSystemMessage(game.room, 'town', 'keep me', game.ctx.now);
    for (let i = 0; i < CHAT_HISTORY_PER_CHANNEL + 25; i++) addSystemMessage(game.room, 'lobby', `n${i}`, game.ctx.now);
    const lobby = game.room.chat.filter((m) => m.channel === 'lobby');
    expect(lobby).toHaveLength(CHAT_HISTORY_PER_CHANNEL);
    expect(lobby.at(-1)?.text).toBe(`n${CHAT_HISTORY_PER_CHANNEL + 24}`);
    expect(game.room.chat.some((m) => m.text === 'keep me')).toBe(true);
  });
});

describe('channel access during a game', () => {
  it('only living mafia can read the den, and only at night with two or more alive', () => {
    const game = makeAtNight(8, 3);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    const town = game.byRole('townsperson')[0] as Player;

    expect(canRead(game.room, m1, 'mafia')).toBe(true);
    expect(canRead(game.room, town, 'mafia')).toBe(false);
    expect(canWrite(game.room, m1, 'mafia')).toBe(true);
    expect(code(() => game.act(town, { type: 'chat', channel: 'mafia', text: 'psst' }))).toBe('FORBIDDEN');

    game.act(m1, { type: 'chat', channel: 'mafia', text: 'pick Ada' });
    expect(game.room.chat.at(-1)).toMatchObject({ channel: 'mafia', text: 'pick Ada' });

    m2.alive = false; // one mafia left: the den falls silent
    expect(canWrite(game.room, m1, 'mafia')).toBe(false);
  });

  it('closes the den by day', () => {
    const game = makeAtNight(8, 3);
    const m1 = game.byRole('mafia')[0] as Player;
    nightKill(game, game.byRole('townsperson')[0] as Player);
    expect(game.room.phase).toBe('day');
    expect(canWrite(game.room, m1, 'mafia')).toBe(false);
  });

  it('lets the living talk in the town square by day but not at night', () => {
    const game = makeAtNight(7);
    const p = game.players[2] as Player;
    expect(canWrite(game.room, p, 'town')).toBe(false); // night
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const living = game.players.find((x) => x.alive) as Player;
    game.act(living, { type: 'chat', channel: 'town', text: 'I am innocent' });
    expect(game.room.chat.at(-1)?.text).toBe('I am innocent');
  });

  it('gives the dead the graveyard and keeps the living out of it', () => {
    const game = makeAtNight(7);
    const victim = game.byRole('townsperson')[0] as Player;
    nightKill(game, victim);
    const living = game.players.find((p) => p.alive) as Player;

    expect(canRead(game.room, victim, 'graveyard')).toBe(true);
    expect(canRead(game.room, living, 'graveyard')).toBe(false);
    game.act(victim, { type: 'chat', channel: 'graveyard', text: 'I was framed' });
    expect(code(() => game.act(victim, { type: 'chat', channel: 'town', text: 'it was Bob' }))).toBe('FORBIDDEN');
    expect(code(() => game.act(living, { type: 'chat', channel: 'graveyard', text: 'hi' }))).toBe('FORBIDDEN');
  });

  it('silent mode blocks free text in the square but allows reactions', () => {
    const game = makeLobby(6);
    game.act(game.players[0] as Player, { type: 'settings', mode: 'silent' });
    game.act(game.players[0] as Player, { type: 'start' });
    for (const p of game.players) game.act(p, { type: 'ready' });
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const living = game.players.find((p) => p.alive) as Player;

    expect(code(() => game.act(living, { type: 'chat', channel: 'town', text: 'hello' }))).toBe('FORBIDDEN');
    game.act(living, { type: 'react', reaction: 'sus' });
    expect(game.room.chat.at(-1)).toMatchObject({ kind: 'reaction', text: 'SUS' });
  });

  it('reactions come from a fixed list so nobody can smuggle custom text', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const living = game.players.find((p) => p.alive) as Player;
    const message = postReaction(game.room, living, 'liar', game.ctx.now);
    expect(message.text).toBe('LIAR!');
  });

  it('everyone can talk again once the game has ended', () => {
    const game = makeAtNight(6, 11);
    game.room.phase = 'end';
    const dead = game.players[1] as Player;
    dead.alive = false;
    expect(canWrite(game.room, dead, 'town')).toBe(true);
    expect(canRead(game.room, dead, 'graveyard')).toBe(false);
    expect(postText(game.room, dead, 'town', 'gg', game.ctx.now).text).toBe('gg');
  });
});
