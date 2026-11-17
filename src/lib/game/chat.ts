import {
  CHAT_HISTORY_PER_CHANNEL,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT,
  REACTION_TEXT,
} from './config';
import { GameError } from './errors';
import type { Channel, ChatMessage, MessageKind, Player, Reaction, Room } from './types';

/**
 * True for characters that must never reach other players: control codes,
 * zero-width characters and bidirectional-text overrides (used for spoofing).
 */
function isUnsafeCodePoint(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069) ||
    code === 0xfeff
  );
}

/** Replaces unsafe characters, collapses whitespace runs and trims. */
export function sanitizeText(raw: string): string {
  const cleaned = Array.from(raw, (ch) => (isUnsafeCodePoint(ch.codePointAt(0) ?? 0) ? ' ' : ch)).join('');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function livingMafiaCount(room: Room): number {
  return room.players.filter((p) => p.alive && p.role === 'mafia').length;
}

/** Whether the mafia den is open for talking right now. */
export function mafiaChatOpen(room: Room): boolean {
  return room.phase === 'night' && livingMafiaCount(room) >= 2;
}

export function canRead(room: Room, player: Player, channel: Channel): boolean {
  switch (channel) {
    case 'lobby':
      return room.phase === 'lobby';
    case 'town':
      return room.phase !== 'lobby';
    case 'mafia':
      return room.phase !== 'lobby' && player.role === 'mafia' && player.alive;
    case 'graveyard':
      return room.phase !== 'lobby' && room.phase !== 'end' && !player.alive;
  }
}

/**
 * Whether `player` may post `kind` into `channel` right now.
 * Reactions are allowed wherever text is, plus in silent mode's town square.
 */
export function canWrite(room: Room, player: Player, channel: Channel, kind: MessageKind = 'text'): boolean {
  if (!canRead(room, player, channel)) return false;
  switch (channel) {
    case 'lobby':
      return true;
    case 'town': {
      const open = ['day', 'vote', 'verdict', 'dawn'].includes(room.phase) ? player.alive : room.phase === 'end';
      if (!open) return false;
      return !(room.mode === 'silent' && kind === 'text' && room.phase !== 'end');
    }
    case 'mafia':
      return mafiaChatOpen(room);
    case 'graveyard':
      return true;
  }
}

function pushMessage(room: Room, message: Omit<ChatMessage, 'id'>): ChatMessage {
  const full: ChatMessage = { ...message, id: room.nextMessageId++ };
  room.chat.push(full);

  // Drop the oldest messages of this channel once it exceeds the cap.
  let count = 0;
  for (const m of room.chat) if (m.channel === message.channel) count++;
  if (count > CHAT_HISTORY_PER_CHANNEL) {
    let excess = count - CHAT_HISTORY_PER_CHANNEL;
    room.chat = room.chat.filter((m) => {
      if (m.channel === message.channel && excess > 0) {
        excess--;
        return false;
      }
      return true;
    });
  }
  return full;
}

export function addSystemMessage(room: Room, channel: Channel, text: string, now: number): void {
  pushMessage(room, { channel, kind: 'system', authorId: null, authorName: 'Hushtown', text, at: now });
}

function enforceRateLimit(player: Player, now: number): void {
  const { max, windowMs } = CHAT_RATE_LIMIT;
  player.chatTimes = player.chatTimes.filter((t) => now - t < windowMs);
  if (player.chatTimes.length >= max) {
    throw new GameError('RATE_LIMITED', 'Slow down. You are talking too fast.');
  }
  player.chatTimes.push(now);
}

/** Validates permissions and rate limits, then stores a free-text message. */
export function postText(room: Room, player: Player, channel: Channel, rawText: string, now: number): ChatMessage {
  const text = sanitizeText(rawText);
  if (text.length === 0) throw new GameError('BAD_REQUEST', 'Message is empty.');
  if (text.length > CHAT_MAX_LENGTH) throw new GameError('BAD_REQUEST', `Message is longer than ${CHAT_MAX_LENGTH} characters.`);
  if (!canWrite(room, player, channel, 'text')) throw new GameError('FORBIDDEN', 'You cannot talk here right now.');
  enforceRateLimit(player, now);
  return pushMessage(room, { channel, kind: 'text', authorId: player.id, authorName: player.name, text, at: now });
}

/** Posts a wordless reaction into the town square. */
export function postReaction(room: Room, player: Player, reaction: Reaction, now: number): ChatMessage {
  if (!canWrite(room, player, 'town', 'reaction')) throw new GameError('FORBIDDEN', 'You cannot react right now.');
  enforceRateLimit(player, now);
  return pushMessage(room, {
    channel: 'town',
    kind: 'reaction',
    authorId: player.id,
    authorName: player.name,
    text: REACTION_TEXT[reaction],
    at: now,
  });
}
