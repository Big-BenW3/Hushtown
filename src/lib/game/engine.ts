/**
 * Hushtown game engine.
 *
 * A synchronous, server-authoritative state machine. Every function mutates
 * the `Room` it is given, and every dependency on the outside world (clock,
 * randomness, id generation) arrives through `EngineContext`, so the whole
 * game can be tested deterministically.
 *
 * Because Node runs one request at a time per process and nothing here awaits,
 * each action is atomic: no locking is required.
 */
import { addSystemMessage, postReaction, postText } from './chat';
import { DISCUSSION, MAX_PLAYERS, MIN_PLAYERS, phaseSeconds } from './config';
import { GameError } from './errors';
import { resolveNight } from './night';
import { assignRoles } from './roles';
import type { Action, EngineContext, Phase, Player, Room } from './types';
import { tallyVotes } from './vote';
import { checkWinner } from './win';

/** After this long without a connection, a lobby seat is released. */
export const LOBBY_SEAT_TIMEOUT_MS = 60_000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Collapses whitespace so "  Ada   B " and "Ada B" are the same name. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function bump(room: Room, now: number): void {
  room.version += 1;
  room.updatedAt = now;
}

function findPlayer(room: Room, id: string): Player {
  const player = room.players.find((p) => p.id === id);
  if (!player) throw new GameError('UNAUTHORIZED', 'You are not in this town.');
  return player;
}

function living(room: Room): Player[] {
  return room.players.filter((p) => p.alive);
}

function requirePhase(room: Room, ...phases: Phase[]): void {
  if (!phases.includes(room.phase)) {
    throw new GameError('CONFLICT', `That is not possible during the ${room.phase} phase.`);
  }
}

function requireAlive(player: Player): void {
  if (!player.alive) throw new GameError('FORBIDDEN', 'The dead cannot do that.');
}

function requireHost(room: Room, player: Player): void {
  if (room.hostId !== player.id) throw new GameError('FORBIDDEN', 'Only the host can do that.');
}

function setDeadline(room: Room, seconds: number, ctx: EngineContext): void {
  room.deadline = ctx.now + Math.round(seconds * 1000 * ctx.timeScale);
}

function nameOf(room: Room, id: string | null): string {
  return room.players.find((p) => p.id === id)?.name ?? 'Someone';
}

/* ------------------------------------------------------------------ */
/* Room and player lifecycle                                           */
/* ------------------------------------------------------------------ */

function makePlayer(name: string, ctx: EngineContext): Player {
  return {
    id: ctx.newId(),
    name,
    token: ctx.newToken(),
    role: null,
    alive: true,
    connected: false,
    disconnectedAt: ctx.now,
    joinedAt: ctx.now,
    seenRole: false,
    acked: false,
    nightTarget: null,
    nightLocked: false,
    accuse: null,
    vote: null,
    skip: false,
    chatTimes: [],
  };
}

export function createRoom(code: string, hostName: string, ctx: EngineContext): { room: Room; player: Player } {
  const player = makePlayer(normalizeName(hostName), ctx);
  const room: Room = {
    code,
    hostId: player.id,
    players: [player],
    phase: 'lobby',
    mode: 'classic',
    discussionSeconds: DISCUSSION.default,
    round: 0,
    deadline: null,
    version: 1,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    chat: [],
    nextMessageId: 1,
    winner: null,
    lastNight: null,
    lastVerdict: null,
    detectiveLog: [],
    revealed: {},
    timeline: [],
  };
  return { room, player };
}

export function addPlayer(room: Room, rawName: string, ctx: EngineContext): Player {
  if (room.phase !== 'lobby') throw new GameError('CONFLICT', 'The game has already started.');
  if (room.players.length >= MAX_PLAYERS) throw new GameError('ROOM_FULL', 'This town is full.');

  const name = normalizeName(rawName);
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError('CONFLICT', 'Someone in this town already has that name.');
  }

  const player = makePlayer(name, ctx);
  room.players.push(player);
  addSystemMessage(room, 'lobby', `${name} joined the town.`, ctx.now);
  bump(room, ctx.now);
  return player;
}

/** Records a connection change. Returns true if anything observable changed. */
export function setConnected(room: Room, playerId: string, connected: boolean, now: number): boolean {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.connected === connected) return false;
  player.connected = connected;
  player.disconnectedAt = connected ? null : now;
  bump(room, now);
  return true;
}

/** Removes a player and hands over hosting if needed. */
function removePlayer(room: Room, playerId: string, now: number, announce: string | null): void {
  const index = room.players.findIndex((p) => p.id === playerId);
  if (index === -1) return;
  const [removed] = room.players.splice(index, 1);
  if (announce && removed) addSystemMessage(room, 'lobby', `${removed.name} ${announce}`, now);
  if (room.hostId === playerId && room.players[0]) {
    room.hostId = room.players[0].id;
  }
  bump(room, now);
}

/* ------------------------------------------------------------------ */
/* Phase transitions                                                   */
/* ------------------------------------------------------------------ */

function startRoles(room: Room, ctx: EngineContext): void {
  assignRoles(room.players, ctx.rng);
  for (const p of room.players) {
    p.alive = true;
    p.seenRole = false;
  }
  room.phase = 'role';
  room.round = 0;
  room.timeline = [];
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).role, ctx);
}

function startNight(room: Room, ctx: EngineContext): void {
  room.round += 1;
  room.phase = 'night';
  for (const p of room.players) {
    p.nightTarget = null;
    p.nightLocked = false;
  }
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).night, ctx);

  const mafiaCount = living(room).filter((p) => p.role === 'mafia').length;
  if (mafiaCount >= 2) {
    addSystemMessage(room, 'mafia', `Night ${room.round} begins. Only you can read this.`, ctx.now);
  }
}

function startDawn(room: Room, ctx: EngineContext): void {
  const { outcome, detective } = resolveNight(room.players, room.round, ctx.rng);
  room.lastNight = outcome;
  if (detective) room.detectiveLog.push(detective);

  if (outcome.victimId) {
    const name = nameOf(room, outcome.victimId);
    room.timeline.push(`Night ${room.round}: ${name} was killed.`);
    addSystemMessage(room, 'town', `${name} was found at dawn.`, ctx.now);
  } else {
    room.timeline.push(`Night ${room.round}: nobody died.`);
    addSystemMessage(room, 'town', 'Nobody died last night.', ctx.now);
  }

  room.winner = checkWinner(room.players);
  room.phase = 'dawn';
  for (const p of room.players) p.acked = false;
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).dawn, ctx);
}

function startDay(room: Room, ctx: EngineContext): void {
  room.phase = 'day';
  for (const p of room.players) {
    p.accuse = null;
    p.skip = false;
  }
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).day, ctx);
}

function startVote(room: Room, ctx: EngineContext): void {
  room.phase = 'vote';
  for (const p of room.players) p.vote = null;
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).vote, ctx);
}

function startVerdict(room: Room, ctx: EngineContext): void {
  const verdict = tallyVotes(room.players, room.round);
  room.lastVerdict = verdict;

  if (verdict.hangedId) {
    const hanged = room.players.find((p) => p.id === verdict.hangedId);
    if (hanged?.role) {
      hanged.alive = false;
      room.revealed[hanged.id] = hanged.role;
      room.timeline.push(`Day ${room.round}: ${hanged.name} was hanged. They were ${hanged.role}.`);
      addSystemMessage(room, 'town', `${hanged.name} was hanged.`, ctx.now);
    }
  } else {
    room.timeline.push(`Day ${room.round}: the town could not agree.`);
    addSystemMessage(room, 'town', 'The town could not agree. Nobody hangs.', ctx.now);
  }

  room.winner = checkWinner(room.players);
  room.phase = 'verdict';
  for (const p of room.players) p.acked = false;
  setDeadline(room, phaseSeconds(room.mode, room.discussionSeconds).verdict, ctx);
}

function endGame(room: Room, ctx: EngineContext): void {
  room.phase = 'end';
  room.deadline = null;
  const label = room.winner === 'mafia' ? 'The mafia wins.' : 'The town wins.';
  room.timeline.push(label);
  addSystemMessage(room, 'town', `${label} Say what you like.`, ctx.now);
}

/** Moves to the phase that follows the current one. */
function advance(room: Room, ctx: EngineContext): void {
  switch (room.phase) {
    case 'role':
      return startNight(room, ctx);
    case 'night':
      return startDawn(room, ctx);
    case 'dawn':
      return room.winner ? endGame(room, ctx) : startDay(room, ctx);
    case 'day':
      return startVote(room, ctx);
    case 'vote':
      return startVerdict(room, ctx);
    case 'verdict':
      return room.winner ? endGame(room, ctx) : startNight(room, ctx);
    default:
      return;
  }
}

/** True when everyone who needs to has acted, so the phase can end before its timer. */
function readyToAdvance(room: Room): boolean {
  const alive = living(room);
  switch (room.phase) {
    case 'role':
      return room.players.every((p) => p.seenRole);
    case 'dawn':
    case 'verdict':
      return alive.every((p) => p.acked);
    case 'day': {
      const wantsSkip = alive.filter((p) => p.skip).length;
      return wantsSkip * 2 > alive.length;
    }
    case 'vote':
      return alive.every((p) => p.vote !== null);
    // The night always runs to its timer so its length never reveals who is still alive.
    default:
      return false;
  }
}

function advanceIfReady(room: Room, ctx: EngineContext): void {
  if (readyToAdvance(room)) advance(room, ctx);
}

/**
 * Drives timed behaviour. Call regularly with the current time.
 * Returns true if the room changed.
 */
export function tick(room: Room, ctx: EngineContext): boolean {
  const before = room.version;

  // Release lobby seats that have been disconnected for too long.
  if (room.phase === 'lobby') {
    for (const p of [...room.players]) {
      if (!p.connected && p.disconnectedAt !== null && ctx.now - p.disconnectedAt > LOBBY_SEAT_TIMEOUT_MS) {
        removePlayer(room, p.id, ctx.now, 'wandered off.');
      }
    }
  }

  // A long timeScale-reduced game can overrun several deadlines; bound the loop defensively.
  for (let i = 0; i < 4 && room.deadline !== null && ctx.now >= room.deadline; i++) {
    advance(room, ctx);
    bump(room, ctx.now);
  }
  return room.version !== before;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function requireLivingOther(room: Room, actor: Player, targetId: string): Player {
  const target = room.players.find((p) => p.id === targetId);
  if (!target) throw new GameError('BAD_REQUEST', 'That player is not in this town.');
  if (!target.alive) throw new GameError('BAD_REQUEST', 'That player is already dead.');
  if (target.id === actor.id) throw new GameError('BAD_REQUEST', 'You cannot pick yourself.');
  return target;
}

function handleNightPick(room: Room, actor: Player, targetId: string): void {
  requirePhase(room, 'night');
  requireAlive(actor);
  if (actor.role === 'townsperson' || actor.role === null) {
    throw new GameError('FORBIDDEN', 'You have nothing to do at night. Sleep.');
  }
  if (actor.nightLocked) throw new GameError('CONFLICT', 'You already locked in your choice.');

  if (actor.role === 'doctor') {
    // The doctor may protect anyone alive, including themselves.
    const target = room.players.find((p) => p.id === targetId);
    if (!target || !target.alive) throw new GameError('BAD_REQUEST', 'That player is not available.');
  } else {
    const target = requireLivingOther(room, actor, targetId);
    if (actor.role === 'mafia' && target.role === 'mafia') {
      throw new GameError('BAD_REQUEST', 'You cannot target your own partner.');
    }
  }
  actor.nightTarget = targetId;
}

function handleLock(room: Room, actor: Player): void {
  requirePhase(room, 'night');
  requireAlive(actor);
  if (!actor.nightTarget) throw new GameError('BAD_REQUEST', 'Pick someone first.');
  actor.nightLocked = true;
}

function handleVote(room: Room, actor: Player, targetId: string): void {
  requirePhase(room, 'vote');
  requireAlive(actor);
  if (targetId !== 'abstain') requireLivingOther(room, actor, targetId);
  actor.vote = targetId;
}

function handleSettings(room: Room, actor: Player, action: Extract<Action, { type: 'settings' }>): void {
  requirePhase(room, 'lobby');
  requireHost(room, actor);
  if (action.mode) room.mode = action.mode;
  if (action.discussionSeconds !== undefined) {
    const s = action.discussionSeconds;
    const onStep = (s - DISCUSSION.min) % DISCUSSION.step === 0;
    if (s < DISCUSSION.min || s > DISCUSSION.max || !onStep) {
      throw new GameError('BAD_REQUEST', 'Discussion time is out of range.');
    }
    room.discussionSeconds = s;
  }
}

function handleAgain(room: Room, actor: Player, ctx: EngineContext): void {
  requirePhase(room, 'end');
  requireHost(room, actor);
  room.players = room.players.filter((p) => p.connected || p.id === actor.id);
  for (const p of room.players) {
    Object.assign(p, {
      role: null,
      alive: true,
      seenRole: false,
      acked: false,
      nightTarget: null,
      nightLocked: false,
      accuse: null,
      vote: null,
      skip: false,
    });
  }
  room.phase = 'lobby';
  room.round = 0;
  room.deadline = null;
  room.winner = null;
  room.lastNight = null;
  room.lastVerdict = null;
  room.detectiveLog = [];
  room.revealed = {};
  room.timeline = [];
  room.chat = [];
  addSystemMessage(room, 'lobby', 'A new town gathers.', ctx.now);
}

/**
 * Applies one player action. Throws `GameError` for anything not allowed;
 * the room is never left half-modified because all validation happens
 * before any mutation in each handler.
 */
export function applyAction(room: Room, playerId: string, action: Action, ctx: EngineContext): void {
  const actor = findPlayer(room, playerId);

  switch (action.type) {
    case 'settings':
      handleSettings(room, actor, action);
      break;

    case 'start':
      requirePhase(room, 'lobby');
      requireHost(room, actor);
      if (room.players.length < MIN_PLAYERS) {
        throw new GameError('CONFLICT', `You need at least ${MIN_PLAYERS} players to begin.`);
      }
      startRoles(room, ctx);
      break;

    case 'ready':
      requirePhase(room, 'role');
      actor.seenRole = true;
      break;

    case 'night':
      handleNightPick(room, actor, action.targetId);
      break;

    case 'lock':
      handleLock(room, actor);
      break;

    case 'ack':
      requirePhase(room, 'dawn', 'verdict');
      actor.acked = true;
      break;

    case 'accuse': {
      requirePhase(room, 'day');
      requireAlive(actor);
      if (action.targetId !== null) requireLivingOther(room, actor, action.targetId);
      // Tapping the same player again withdraws the accusation.
      actor.accuse = actor.accuse === action.targetId ? null : action.targetId;
      break;
    }

    case 'skip':
      requirePhase(room, 'day');
      requireAlive(actor);
      actor.skip = !actor.skip;
      break;

    case 'vote':
      handleVote(room, actor, action.targetId);
      break;

    case 'chat':
      postText(room, actor, action.channel, action.text, ctx.now);
      break;

    case 'react':
      postReaction(room, actor, action.reaction, ctx.now);
      break;

    case 'leave':
      if (room.phase === 'lobby') removePlayer(room, actor.id, ctx.now, 'left the town.');
      else if (room.phase === 'end') removePlayer(room, actor.id, ctx.now, null);
      // Mid-game, leaving just drops the connection; the seat stays so they can return.
      break;

    case 'again':
      handleAgain(room, actor, ctx);
      break;
  }

  advanceIfReady(room, ctx);
  bump(room, ctx.now);
}
