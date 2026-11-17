/**
 * Builds the redacted, per-player projection of a room.
 *
 * This is the ONLY place server state is turned into something a client
 * sees. Rule of thumb: a field appears here only if the viewer is entitled
 * to know it right now. The test suite asserts that secrets never leak.
 */
import { canRead, canWrite, mafiaChatOpen } from './chat';
import { CHAT_VIEW_LIMIT, MAX_PLAYERS, MIN_PLAYERS } from './config';
import type { Channel, ChatMessage, EngineContext, Phase, Player, PlayerView, PublicPlayer, Role, Room } from './types';

const CHANNELS: Channel[] = ['lobby', 'town', 'mafia', 'graveyard'];

function nightAction(player: Player): 'kill' | 'save' | 'investigate' | null {
  if (!player.alive) return null;
  if (player.role === 'mafia') return 'kill';
  if (player.role === 'doctor') return 'save';
  if (player.role === 'detective') return 'investigate';
  return null;
}

function publicPlayers(room: Room, viewer: Player): PublicPlayer[] {
  const allRolesVisible = room.phase === 'end';
  const viewerIsMafia = viewer.role === 'mafia';

  return room.players.map((p) => {
    let role: Role | undefined;
    if (p.id === viewer.id && p.role) role = p.role;
    else if (allRolesVisible && p.role) role = p.role;
    else if (room.revealed[p.id]) role = room.revealed[p.id];
    else if (viewerIsMafia && p.role === 'mafia') role = 'mafia';

    return {
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      isHost: p.id === room.hostId,
      ...(role ? { role } : {}),
      ...(room.phase === 'role' ? { seenRole: p.seenRole } : {}),
    };
  });
}

function chatView(room: Room, viewer: Player): PlayerView['chat'] {
  const readable = CHANNELS.filter((c) => canRead(room, viewer, c));
  const writable = CHANNELS.filter((c) => canWrite(room, viewer, c));
  const messages: PlayerView['chat']['messages'] = {};
  for (const channel of readable) {
    const list: ChatMessage[] = room.chat.filter((m) => m.channel === channel);
    messages[channel] = list.slice(-CHAT_VIEW_LIMIT);
  }
  return { readable, writable, messages };
}

function phaseDetails(room: Room, viewer: Player, phase: Phase): Partial<PlayerView> {
  const alive = room.players.filter((p) => p.alive);

  switch (phase) {
    case 'role':
      return { roleProgress: { seen: room.players.filter((p) => p.seenRole).length, total: room.players.length } };

    case 'night': {
      const night: NonNullable<PlayerView['night']> = {
        action: nightAction(viewer),
        target: viewer.nightTarget,
        locked: viewer.nightLocked,
        // Only mafia may learn whether the den is open: it would reveal how many mafia remain.
        mafiaChatEnabled: viewer.role === 'mafia' && viewer.alive && mafiaChatOpen(room),
      };
      if (viewer.role === 'mafia') {
        const partners = room.players.filter((p) => p.role === 'mafia' && p.id !== viewer.id);
        night.partnerTargets = Object.fromEntries(partners.filter((p) => p.alive).map((p) => [p.id, p.nightTarget]));
        night.partnerLocked = Object.fromEntries(partners.filter((p) => p.alive).map((p) => [p.id, p.nightLocked]));
      }
      if (viewer.role === 'detective') night.results = room.detectiveLog;
      return {
        night,
        ...(viewer.role === 'mafia'
          ? { allies: room.players.filter((p) => p.role === 'mafia' && p.id !== viewer.id).map((p) => p.id) }
          : {}),
      };
    }

    case 'dawn': {
      const victimId = room.lastNight?.victimId ?? null;
      const victim = room.players.find((p) => p.id === victimId);
      return {
        dawn: { victimId, victimName: victim?.name ?? null, alive: alive.length },
        ackProgress: { acked: alive.filter((p) => p.acked).length, total: alive.length },
        ...(viewer.role === 'detective' ? { night: detectiveOnly(room) } : {}),
      };
    }

    case 'day': {
      const accusations: Record<string, number> = {};
      for (const p of alive) if (p.accuse) accusations[p.accuse] = (accusations[p.accuse] ?? 0) + 1;
      const skipCount = alive.filter((p) => p.skip).length;
      return {
        day: {
          accusations,
          yourAccuse: viewer.accuse,
          skipCount,
          skipNeeded: Math.floor(alive.length / 2) + 1,
          youSkip: viewer.skip,
        },
        ...(viewer.role === 'detective' ? { night: detectiveOnly(room) } : {}),
      };
    }

    case 'vote':
      // Votes stay hidden until the timer ends: only the viewer's own and a head count.
      return {
        vote: { yourVote: viewer.vote, voted: alive.filter((p) => p.vote !== null).length, total: alive.length },
      };

    case 'verdict': {
      const v = room.lastVerdict;
      const hanged = room.players.find((p) => p.id === v?.hangedId);
      return {
        verdict: {
          hangedId: v?.hangedId ?? null,
          hangedName: hanged?.name ?? null,
          hangedRole: hanged ? (room.revealed[hanged.id] ?? null) : null,
          counts: v?.counts ?? {},
          abstain: v?.abstain ?? 0,
          votes: v?.votes ?? [],
        },
        ackProgress: { acked: alive.filter((p) => p.acked).length, total: alive.length },
      };
    }

    case 'end':
      return {
        end: {
          winner: room.winner ?? 'town',
          roles: room.players.flatMap((p) =>
            p.role ? [{ id: p.id, name: p.name, role: p.role, alive: p.alive }] : [],
          ),
          timeline: room.timeline,
        },
      };

    default:
      return {};
  }
}

/** Detectives keep seeing their notebook by day. */
function detectiveOnly(room: Room): NonNullable<PlayerView['night']> {
  return { action: null, target: null, locked: false, results: room.detectiveLog, mafiaChatEnabled: false };
}

export function viewFor(room: Room, playerId: string, ctx: Pick<EngineContext, 'now'>): PlayerView | null {
  const viewer = room.players.find((p) => p.id === playerId);
  if (!viewer) return null;

  return {
    code: room.code,
    phase: room.phase,
    mode: room.mode,
    discussionSeconds: room.discussionSeconds,
    round: room.round,
    deadline: room.deadline,
    serverNow: ctx.now,
    you: { id: viewer.id, name: viewer.name, alive: viewer.alive, isHost: viewer.id === room.hostId, role: viewer.role },
    players: publicPlayers(room, viewer),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    chat: chatView(room, viewer),
    ...phaseDetails(room, viewer, room.phase),
  };
}
