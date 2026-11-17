/**
 * Runtime validation for everything that crosses the network boundary.
 *
 * Every schema is `.strict()` so unknown fields are rejected rather than
 * silently ignored, and every string has an explicit upper bound.
 */
import { z } from 'zod';
import { CODE_ALPHABET, CODE_LENGTH, DISCUSSION, NAME_MAX, NAME_MIN, NAME_PATTERN } from '@/lib/game/config';
import { normalizeName } from '@/lib/game/engine';

export const playerNameSchema = z
  .string({ required_error: 'Enter a name.', invalid_type_error: 'Name must be text.' })
  .max(64, 'That name is too long.')
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(NAME_MIN, 'Enter a name.')
      .max(NAME_MAX, `Names can be at most ${NAME_MAX} characters.`)
      .regex(NAME_PATTERN, 'Names can use letters, numbers, spaces and . _ - only.'),
  );

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const roomCodeSchema = z
  .string()
  .max(16)
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(CODE_PATTERN, 'Room codes are four letters.'));

/** Ids are 12 lowercase hex characters (see `newPlayerId`). */
const playerIdSchema = z.string().regex(/^[a-f0-9]{12}$/, 'Invalid player.');
const voteTargetSchema = z.union([playerIdSchema, z.literal('abstain')]);

export const createRoomBodySchema = z.object({ name: playerNameSchema }).strict();
export const joinRoomBodySchema = z.object({ name: playerNameSchema }).strict();

const channelSchema = z.enum(['lobby', 'town', 'mafia', 'graveyard']);
const modeSchema = z.enum(['classic', 'quick', 'silent']);
const reactionSchema = z.enum(['liar', 'trust', 'sus', 'shutup']);

export const actionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('settings'),
      mode: modeSchema.optional(),
      discussionSeconds: z.number().int().min(DISCUSSION.min).max(DISCUSSION.max).optional(),
    })
    .strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('night'), targetId: playerIdSchema }).strict(),
  z.object({ type: z.literal('lock') }).strict(),
  z.object({ type: z.literal('ack') }).strict(),
  z.object({ type: z.literal('accuse'), targetId: playerIdSchema.nullable() }).strict(),
  z.object({ type: z.literal('skip') }).strict(),
  z.object({ type: z.literal('vote'), targetId: voteTargetSchema }).strict(),
  // Length is checked tightly by the engine after sanitising; this just bounds memory use.
  z.object({ type: z.literal('chat'), channel: channelSchema, text: z.string().max(1000) }).strict(),
  z.object({ type: z.literal('react'), reaction: reactionSchema }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('again') }).strict(),
]);

/** The bearer token format issued by the server: 32 url-safe base64 characters. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Invalid token.');
