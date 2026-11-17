/**
 * Core domain types for Hushtown.
 *
 * Two families of types live here:
 *  - `Room` / `Player`: the full, server-only, authoritative state.
 *  - `PlayerView`: the redacted projection a single player is allowed to see.
 *    Nothing in `PlayerView` may leak another player's secret information.
 */

export type Role = 'mafia' | 'doctor' | 'detective' | 'townsperson';

/** Lifecycle of a room, in the order phases normally occur. */
export type Phase = 'lobby' | 'role' | 'night' | 'dawn' | 'day' | 'vote' | 'verdict' | 'end';

/** Preset difficulty: changes phase lengths and whether free text is allowed by day. */
export type Mode = 'classic' | 'quick' | 'silent';

export type Winner = 'mafia' | 'town';

/** Chat rooms. Access rules live in `chat.ts`. */
export type Channel = 'lobby' | 'town' | 'mafia' | 'graveyard';

export type MessageKind = 'text' | 'reaction' | 'system';

/** Fixed set of wordless reactions (the server maps each key to display text). */
export type Reaction = 'liar' | 'trust' | 'sus' | 'shutup';

export interface ChatMessage {
  id: number;
  channel: Channel;
  kind: MessageKind;
  /** `null` for system messages. */
  authorId: string | null;
  authorName: string;
  text: string;
  at: number;
}

export interface Player {
  id: string;
  name: string;
  /** Secret bearer token. Never included in any view. */
  token: string;
  role: Role | null;
  alive: boolean;
  connected: boolean;
  /** When the last connection dropped; null while connected. Used to prune idle lobby seats. */
  disconnectedAt: number | null;
  joinedAt: number;
  /** Has looked at their role card at least once (role phase). */
  seenRole: boolean;
  /** Acknowledged the dawn/verdict screen. */
  acked: boolean;
  /** Night target: kill (mafia), save (doctor) or investigate (detective). */
  nightTarget: string | null;
  nightLocked: boolean;
  /** Day accusation target. */
  accuse: string | null;
  /** Vote target id, `'abstain'`, or null if not yet voted. */
  vote: string | 'abstain' | null;
  /** Wants to skip the rest of the discussion. */
  skip: boolean;
  /** Timestamps of recent chat messages, for rate limiting. */
  chatTimes: number[];
}

export interface DetectiveResult {
  round: number;
  targetId: string;
  targetName: string;
  isMafia: boolean;
}

export interface NightOutcome {
  round: number;
  victimId: string | null;
  /** True if the doctor protected the mafia's chosen victim. Never shown to players. */
  saved: boolean;
}

export interface VerdictOutcome {
  round: number;
  hangedId: string | null;
  counts: Record<string, number>;
  abstain: number;
  votes: { voterId: string; targetId: string | 'abstain' }[];
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  phase: Phase;
  mode: Mode;
  discussionSeconds: number;
  /** Night/day counter; starts at 1 on the first night. 0 in the lobby. */
  round: number;
  /** Epoch ms at which the current phase ends, or null if untimed. */
  deadline: number | null;
  /** Monotonic counter bumped on every observable change; used to dedupe pushes. */
  version: number;
  createdAt: number;
  updatedAt: number;
  chat: ChatMessage[];
  nextMessageId: number;
  winner: Winner | null;
  lastNight: NightOutcome | null;
  lastVerdict: VerdictOutcome | null;
  detectiveLog: DetectiveResult[];
  /** Roles made public by a hanging; keyed by player id. */
  revealed: Record<string, Role>;
  /** Human-readable summary of what happened, shown on the end screen. */
  timeline: string[];
}

/** Everything the engine needs from the outside world, injected for testability. */
export interface EngineContext {
  now: number;
  rng: Rng;
  newId: () => string;
  newToken: () => string;
  /** Multiplier applied to every phase duration (1 in production). */
  timeScale: number;
}

export interface Rng {
  /** Uniform integer in `[0, max)`. */
  int(max: number): number;
}

/** Actions a player can request. Parsed and validated by Zod before reaching the engine. */
export type Action =
  | { type: 'settings'; mode?: Mode; discussionSeconds?: number }
  | { type: 'start' }
  | { type: 'ready' }
  | { type: 'night'; targetId: string }
  | { type: 'lock' }
  | { type: 'ack' }
  | { type: 'accuse'; targetId: string | null }
  | { type: 'skip' }
  | { type: 'vote'; targetId: string | 'abstain' }
  | { type: 'chat'; channel: Channel; text: string }
  | { type: 'react'; reaction: Reaction }
  | { type: 'leave' }
  | { type: 'again' };

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  /** Only present when legitimately known to this viewer. */
  role?: Role;
  /** Role phase: has this player looked at their card? */
  seenRole?: boolean;
}

export interface ChatView {
  /** Channels this viewer can read. */
  readable: Channel[];
  /** Channels this viewer can currently post in. */
  writable: Channel[];
  messages: Partial<Record<Channel, ChatMessage[]>>;
}

export interface PlayerView {
  code: string;
  phase: Phase;
  mode: Mode;
  discussionSeconds: number;
  round: number;
  deadline: number | null;
  serverNow: number;
  you: {
    id: string;
    name: string;
    alive: boolean;
    isHost: boolean;
    role: Role | null;
  };
  players: PublicPlayer[];
  minPlayers: number;
  maxPlayers: number;
  chat: ChatView;

  /** Role phase progress. */
  roleProgress?: { seen: number; total: number };
  /** Partners (mafia only). */
  allies?: string[];
  night?: {
    /** What the viewer may do tonight: null for townspeople, the dead and non-night phases. */
    action: 'kill' | 'save' | 'investigate' | null;
    target: string | null;
    locked: boolean;
    /** Mafia only: partner picks keyed by partner id. */
    partnerTargets?: Record<string, string | null>;
    partnerLocked?: Record<string, boolean>;
    /** Detective only: all results so far. */
    results?: DetectiveResult[];
    mafiaChatEnabled: boolean;
  };
  dawn?: { victimId: string | null; victimName: string | null; alive: number };
  ackProgress?: { acked: number; total: number };
  day?: {
    accusations: Record<string, number>;
    yourAccuse: string | null;
    skipCount: number;
    skipNeeded: number;
    youSkip: boolean;
  };
  vote?: { yourVote: string | null; voted: number; total: number };
  verdict?: {
    hangedId: string | null;
    hangedName: string | null;
    hangedRole: Role | null;
    counts: Record<string, number>;
    abstain: number;
    votes: { voterId: string; targetId: string | 'abstain' }[];
  };
  end?: {
    winner: Winner;
    roles: { id: string; name: string; role: Role; alive: boolean }[];
    timeline: string[];
  };
}
