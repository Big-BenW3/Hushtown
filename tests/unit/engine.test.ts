import { describe, expect, it } from 'vitest';
import { addPlayer, applyAction, createRoom, LOBBY_SEAT_TIMEOUT_MS, normalizeName, setConnected, tick } from '@/lib/game/engine';
import { GameError } from '@/lib/game/errors';
import type { Player } from '@/lib/game/types';
import { makeAtNight, makeCtx, makeLobby, makeStarted, nightKill } from '../helpers';

/** Asserts the callback throws a GameError with the given code. */
function expectError(fn: () => void, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameError);
    expect((error as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code} but nothing was thrown`);
}

describe('lobby', () => {
  it('creates a room with the host as the only player', () => {
    const ctx = makeCtx();
    const { room, player } = createRoom('BCDF', '  Ada   Obi ', ctx);
    expect(room.hostId).toBe(player.id);
    expect(player.name).toBe('Ada Obi');
    expect(room.phase).toBe('lobby');
  });

  it('adds players and announces them', () => {
    const game = makeLobby(3);
    expect(game.room.players).toHaveLength(3);
    expect(game.room.chat.some((m) => m.text.includes('Player1 joined'))).toBe(true);
  });

  it('rejects duplicate names regardless of case or spacing', () => {
    const game = makeLobby(2);
    expectError(() => addPlayer(game.room, ' player1 ', game.ctx), 'CONFLICT');
    expect(normalizeName('  a   b ')).toBe('a b');
  });

  it('rejects a sixteenth player', () => {
    const game = makeLobby(15);
    expectError(() => addPlayer(game.room, 'Extra', game.ctx), 'ROOM_FULL');
  });

  it('rejects joining once the game has started', () => {
    const game = makeStarted(6);
    expectError(() => addPlayer(game.room, 'Late', game.ctx), 'CONFLICT');
  });

  it('only the host can change settings, and only in the lobby', () => {
    const game = makeLobby(5);
    const [host, other] = game.players as [Player, Player];
    expectError(() => game.act(other, { type: 'settings', mode: 'quick' }), 'FORBIDDEN');
    game.act(host, { type: 'settings', mode: 'quick', discussionSeconds: 120 });
    expect(game.room.mode).toBe('quick');
    expect(game.room.discussionSeconds).toBe(120);
  });

  it.each([30, 45, 90 + 1, 330, 0, -60])('rejects discussion time %i', (seconds) => {
    const game = makeLobby(5);
    expectError(() => game.act(game.players[0] as Player, { type: 'settings', discussionSeconds: seconds }), 'BAD_REQUEST');
    expect(game.room.discussionSeconds).toBe(180);
  });

  it('refuses to start with fewer than five players or by a non-host', () => {
    const small = makeLobby(4);
    expectError(() => small.act(small.players[0] as Player, { type: 'start' }), 'CONFLICT');
    const full = makeLobby(5);
    expectError(() => full.act(full.players[1] as Player, { type: 'start' }), 'FORBIDDEN');
  });

  it('transfers the host when the host leaves', () => {
    const game = makeLobby(5);
    const [host, second] = game.players as [Player, Player];
    game.act(host, { type: 'leave' });
    expect(game.room.players).toHaveLength(4);
    expect(game.room.hostId).toBe(second.id);
  });

  it('releases a lobby seat that stays disconnected too long', () => {
    const game = makeLobby(5);
    const ghost = game.players[3] as Player;
    setConnected(game.room, ghost.id, false, game.ctx.now);
    game.ctx.now += LOBBY_SEAT_TIMEOUT_MS + 1;
    expect(tick(game.room, game.ctx)).toBe(true);
    expect(game.room.players.find((p) => p.id === ghost.id)).toBeUndefined();
  });

  it('keeps connected lobby players forever', () => {
    const game = makeLobby(5);
    game.ctx.now += LOBBY_SEAT_TIMEOUT_MS * 10;
    tick(game.room, game.ctx);
    expect(game.room.players).toHaveLength(5);
  });
});

describe('role phase', () => {
  it('starts with roles dealt and everyone alive', () => {
    const game = makeStarted(7);
    expect(game.room.phase).toBe('role');
    expect(game.players.every((p) => p.role && p.alive)).toBe(true);
    expect(game.room.deadline).toBeGreaterThan(game.ctx.now);
  });

  it('moves to night as soon as everyone has looked', () => {
    const game = makeStarted(6);
    for (const p of game.players.slice(0, -1)) game.act(p, { type: 'ready' });
    expect(game.room.phase).toBe('role');
    game.act(game.players[5] as Player, { type: 'ready' });
    expect(game.room.phase).toBe('night');
    expect(game.room.round).toBe(1);
  });

  it('moves to night when the timer runs out even if someone never looked', () => {
    const game = makeStarted(6);
    game.wait(46);
    expect(game.room.phase).toBe('night');
  });

  it('refuses night actions before the night', () => {
    const game = makeStarted(6);
    expectError(() => game.act(game.byRole('mafia')[0] as Player, { type: 'night', targetId: game.players[0]!.id }), 'CONFLICT');
  });
});

describe('night', () => {
  it('only lets the right roles act and validates targets', () => {
    const game = makeAtNight(8, 3);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    const town = game.byRole('townsperson')[0] as Player;
    const doctor = game.byRole('doctor')[0] as Player;
    const detective = game.byRole('detective')[0] as Player;

    expectError(() => game.act(town, { type: 'night', targetId: m1.id }), 'FORBIDDEN');
    expectError(() => game.act(m1, { type: 'night', targetId: m2.id }), 'BAD_REQUEST'); // partner
    expectError(() => game.act(m1, { type: 'night', targetId: m1.id }), 'BAD_REQUEST'); // self
    expectError(() => game.act(m1, { type: 'night', targetId: 'ghost' }), 'BAD_REQUEST');
    expectError(() => game.act(detective, { type: 'night', targetId: detective.id }), 'BAD_REQUEST');

    game.act(doctor, { type: 'night', targetId: doctor.id }); // doctors may save themselves
    expect(doctor.nightTarget).toBe(doctor.id);
  });

  it('cannot lock without a target and cannot change after locking', () => {
    const game = makeAtNight(6);
    const mafia = game.byRole('mafia')[0] as Player;
    const [a, b] = game.byRole('townsperson') as [Player, Player];
    expectError(() => game.act(mafia, { type: 'lock' }), 'BAD_REQUEST');
    game.act(mafia, { type: 'night', targetId: a.id });
    game.act(mafia, { type: 'lock' });
    expectError(() => game.act(mafia, { type: 'night', targetId: b.id }), 'CONFLICT');
    expect(mafia.nightTarget).toBe(a.id);
  });

  it('does not end early even when everyone has locked in (the length must not leak roles)', () => {
    const game = makeAtNight(6);
    for (const p of game.players) {
      if (p.role === 'townsperson') continue;
      const target = game.players.find((t) => t.id !== p.id && t.role !== 'mafia' && t.alive) as Player;
      game.act(p, { type: 'night', targetId: target.id });
      game.act(p, { type: 'lock' });
    }
    expect(game.room.phase).toBe('night');
    game.wait(46);
    expect(game.room.phase).toBe('dawn');
  });

  it('kills the chosen victim by dawn and announces it in the town square', () => {
    const game = makeAtNight(7);
    const victim = game.byRole('townsperson')[0] as Player;
    for (const m of game.byRole('mafia')) game.act(m, { type: 'night', targetId: victim.id });
    game.wait(46);
    expect(game.room.phase).toBe('dawn');
    expect(victim.alive).toBe(false);
    expect(game.room.chat.some((m) => m.channel === 'town' && m.text.includes(victim.name))).toBe(true);
  });
});

describe('day and vote', () => {
  it('runs dawn -> day when everyone acknowledges', () => {
    const game = makeAtNight(7);
    const victim = game.byRole('townsperson')[0] as Player;
    nightKill(game, victim);
    expect(game.room.phase).toBe('day');
  });

  it('ends the day early on a strict majority skip', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const living = game.players.filter((p) => p.alive); // 6
    for (const p of living.slice(0, 3)) game.act(p, { type: 'skip' });
    expect(game.room.phase).toBe('day'); // 3 of 6 is not a majority
    game.act(living[3] as Player, { type: 'skip' });
    expect(game.room.phase).toBe('vote');
  });

  it('lets a player withdraw a skip', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const p = game.players.find((x) => x.alive) as Player;
    game.act(p, { type: 'skip' });
    game.act(p, { type: 'skip' });
    expect(p.skip).toBe(false);
  });

  it('toggles accusations and rejects bad targets', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const [a, b] = game.players.filter((p) => p.alive) as [Player, Player];
    game.act(a, { type: 'accuse', targetId: b.id });
    expect(a.accuse).toBe(b.id);
    game.act(a, { type: 'accuse', targetId: b.id });
    expect(a.accuse).toBeNull();
    expectError(() => game.act(a, { type: 'accuse', targetId: a.id }), 'BAD_REQUEST');
    const dead = game.players.find((p) => !p.alive) as Player;
    expectError(() => game.act(a, { type: 'accuse', targetId: dead.id }), 'BAD_REQUEST');
  });

  function toVote() {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    game.wait(181);
    expect(game.room.phase).toBe('vote');
    return game;
  }

  it('moves to the vote when the discussion timer ends', () => {
    toVote();
  });

  it('ends the vote as soon as every living player has voted and hangs the top pick', () => {
    const game = toVote();
    const living = game.players.filter((p) => p.alive);
    const target = game.firstOther(living[0] as Player);
    for (const p of living) {
      if (p.id === target.id) game.act(p, { type: 'vote', targetId: 'abstain' });
      else game.act(p, { type: 'vote', targetId: target.id });
    }
    expect(game.room.phase).toBe('verdict');
    expect(target.alive).toBe(false);
    expect(game.room.revealed[target.id]).toBe(target.role);
  });

  it('rejects votes for oneself, the dead and strangers, and votes by the dead', () => {
    const game = toVote();
    const living = game.players.filter((p) => p.alive);
    const dead = game.players.find((p) => !p.alive) as Player;
    const voter = living[0] as Player;
    expectError(() => game.act(voter, { type: 'vote', targetId: voter.id }), 'BAD_REQUEST');
    expectError(() => game.act(voter, { type: 'vote', targetId: dead.id }), 'BAD_REQUEST');
    expectError(() => game.act(voter, { type: 'vote', targetId: 'nobody' }), 'BAD_REQUEST');
    expectError(() => game.act(dead, { type: 'vote', targetId: voter.id }), 'FORBIDDEN');
  });

  it('allows changing a vote until the end', () => {
    const game = toVote();
    const [a, b, c] = game.players.filter((p) => p.alive) as [Player, Player, Player];
    game.act(a, { type: 'vote', targetId: b.id });
    game.act(a, { type: 'vote', targetId: c.id });
    expect(a.vote).toBe(c.id);
  });

  it('spares everyone when the vote times out with no votes', () => {
    const game = toVote();
    game.wait(31);
    expect(game.room.phase).toBe('verdict');
    expect(game.room.lastVerdict?.hangedId).toBeNull();
    expect(game.players.filter((p) => p.alive)).toHaveLength(6);
  });

  it('starts the next night after the verdict', () => {
    const game = toVote();
    game.wait(31); // verdict
    game.wait(13); // verdict timeout -> night 2
    expect(game.room.phase).toBe('night');
    expect(game.room.round).toBe(2);
    expect(game.players.every((p) => p.nightTarget === null)).toBe(true);
  });
});

describe('winning', () => {
  it('mafia wins by killing until they equal the town', () => {
    // 5 players: 1 mafia, doctor, detective, 2 town. Kill 3 non-mafia -> mafia 1 vs 1.
    const game = makeAtNight(5, 9);
    const mafia = game.byRole('mafia')[0] as Player;
    const victims = game.players.filter((p) => p !== mafia);

    nightKill(game, victims[0] as Player);
    expect(game.room.phase).toBe('day');
    game.wait(181);
    game.wait(31);
    game.wait(13);
    expect(game.room.phase).toBe('night');
    nightKill(game, victims[1] as Player);
    // 3 alive: mafia + 2 -> not yet. Go again.
    game.wait(181);
    game.wait(31);
    game.wait(13);
    for (const m of game.byRole('mafia')) game.act(m, { type: 'night', targetId: victims[2]!.id });
    game.wait(46);
    expect(game.room.winner).toBe('mafia');
    for (const p of game.players.filter((x) => x.alive)) game.act(p, { type: 'ack' });
    expect(game.room.phase).toBe('end');
  });

  it('town wins by hanging the last mafia', () => {
    const game = makeAtNight(6, 11);
    const mafia = game.byRole('mafia')[0] as Player;
    game.wait(46); // quiet night
    for (const p of game.players) game.act(p, { type: 'ack' });
    game.wait(181);
    for (const p of game.players) {
      game.act(p, { type: 'vote', targetId: p.id === mafia.id ? game.firstOther(mafia).id : mafia.id });
    }
    expect(game.room.phase).toBe('verdict');
    expect(game.room.winner).toBe('town');
    for (const p of game.players.filter((x) => x.alive)) game.act(p, { type: 'ack' });
    expect(game.room.phase).toBe('end');
    expect(game.room.timeline.at(-1)).toMatch(/town wins/i);
  });

  it('host can start a fresh game from the end screen', () => {
    const game = makeAtNight(6, 11);
    const mafia = game.byRole('mafia')[0] as Player;
    game.wait(46);
    for (const p of game.players) game.act(p, { type: 'ack' });
    game.wait(181);
    for (const p of game.players) game.act(p, { type: 'vote', targetId: p.id === mafia.id ? game.firstOther(mafia).id : mafia.id });
    for (const p of game.players.filter((x) => x.alive)) game.act(p, { type: 'ack' });
    expect(game.room.phase).toBe('end');

    expectError(() => game.act(game.players[1] as Player, { type: 'again' }), 'FORBIDDEN');
    game.act(game.players[0] as Player, { type: 'again' });
    expect(game.room.phase).toBe('lobby');
    expect(game.players.every((p) => p.role === null && p.alive)).toBe(true);
    expect(game.room.winner).toBeNull();
  });
});

describe('robustness', () => {
  it('ignores a tick before any deadline', () => {
    const game = makeStarted(6);
    const version = game.room.version;
    expect(tick(game.room, game.ctx)).toBe(false);
    expect(game.room.version).toBe(version);
  });

  it('does not change state or version when an action is rejected', () => {
    const game = makeAtNight(6);
    const before = JSON.stringify(game.room);
    expectError(() => game.act(game.byRole('townsperson')[0] as Player, { type: 'vote', targetId: 'x' }), 'CONFLICT');
    expect(JSON.stringify(game.room)).toBe(before);
  });

  it('rejects actions from players who are not in the room', () => {
    const game = makeLobby(5);
    expectError(() => applyAction(game.room, 'stranger', { type: 'start' }, game.ctx), 'UNAUTHORIZED');
  });

  it('survives a long stall by catching up phase by phase', () => {
    const game = makeAtNight(6);
    game.ctx.now += 10 * 60 * 1000;
    expect(() => tick(game.room, game.ctx)).not.toThrow();
    expect(['dawn', 'day', 'vote', 'verdict', 'night', 'end']).toContain(game.room.phase);
  });

  it('honours the time scale used by test mode', () => {
    const game = makeLobby(5);
    game.ctx.timeScale = 0.1;
    game.act(game.players[0] as Player, { type: 'start' });
    expect(game.room.deadline! - game.ctx.now).toBe(4500);
  });
});
