import { describe, expect, it } from 'vitest';
import type { Player, PlayerView } from '@/lib/game/types';
import { viewFor } from '@/lib/game/view';
import { makeAtNight, makeLobby, makeStarted, nightKill } from '../helpers';
import type { Game } from '../helpers';

const view = (game: Game, p: Player): PlayerView => viewFor(game.room, p.id, game.ctx) as PlayerView;

/** Every secret that must never appear in someone else's payload. */
function assertNoTokens(game: Game): void {
  for (const viewer of game.players) {
    const json = JSON.stringify(view(game, viewer));
    for (const p of game.players) expect(json).not.toContain(p.token);
  }
}

describe('views never leak secrets', () => {
  it('never include any player token', () => {
    const game = makeAtNight(8, 3);
    assertNoTokens(game);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    assertNoTokens(game);
  });

  it('hide everyone else\'s role during the game', () => {
    const game = makeAtNight(8, 3);
    const town = game.byRole('townsperson')[0] as Player;
    const v = view(game, town);
    expect(v.you.role).toBe('townsperson');
    expect(v.players.filter((p) => p.id !== town.id).every((p) => p.role === undefined)).toBe(true);
    expect(v.allies).toBeUndefined();
    expect(v.night?.partnerTargets).toBeUndefined();
  });

  it('show mafia their partners but nobody else', () => {
    const game = makeAtNight(8, 3);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    const v = view(game, m1);
    expect(v.allies).toEqual([m2.id]);
    expect(v.players.find((p) => p.id === m2.id)?.role).toBe('mafia');
    const doctor = view(game, game.byRole('doctor')[0] as Player);
    expect(doctor.players.some((p) => p.role === 'mafia')).toBe(false);
  });

  it('reveal a partner\'s pick to mafia only', () => {
    const game = makeAtNight(8, 3);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    const target = game.byRole('townsperson')[0] as Player;
    game.act(m2, { type: 'night', targetId: target.id });
    expect(view(game, m1).night?.partnerTargets).toEqual({ [m2.id]: target.id });
    const doctorView = view(game, game.byRole('doctor')[0] as Player);
    expect(doctorView.night?.partnerTargets).toBeUndefined();
    expect(doctorView.night?.target).toBeNull();
  });

  it('does not reveal to non-mafia whether the mafia den is open', () => {
    const game = makeAtNight(8, 3);
    expect(view(game, game.byRole('mafia')[0] as Player).night?.mafiaChatEnabled).toBe(true);
    for (const role of ['doctor', 'detective', 'townsperson'] as const) {
      expect(view(game, game.byRole(role)[0] as Player).night?.mafiaChatEnabled).toBe(false);
    }
  });

  it('give the detective results privately and keep them through the day', () => {
    const game = makeAtNight(8, 3);
    const detective = game.byRole('detective')[0] as Player;
    const mafia = game.byRole('mafia')[0] as Player;
    game.act(detective, { type: 'night', targetId: mafia.id });
    game.wait(46);
    const v = view(game, detective);
    expect(v.night?.results).toEqual([expect.objectContaining({ targetId: mafia.id, isMafia: true })]);
    const other = view(game, game.byRole('townsperson')[0] as Player);
    expect(other.night?.results).toBeUndefined();
  });

  it('never reveals whether the doctor saved someone', () => {
    const game = makeAtNight(8, 3);
    const victim = game.byRole('townsperson')[0] as Player;
    for (const m of game.byRole('mafia')) game.act(m, { type: 'night', targetId: victim.id });
    game.act(game.byRole('doctor')[0] as Player, { type: 'night', targetId: victim.id });
    game.wait(46);
    for (const p of game.players) {
      const v = view(game, p);
      expect(v.dawn).toEqual({ victimId: null, victimName: null, alive: 8 });
      expect(JSON.stringify(v)).not.toContain('saved');
    }
  });

  it('keeps votes hidden until the vote ends', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    game.wait(181);
    const [a, b, c] = game.players.filter((p) => p.alive) as [Player, Player, Player];
    game.act(a, { type: 'vote', targetId: c.id });
    game.act(b, { type: 'vote', targetId: c.id });

    const bView = view(game, b);
    expect(bView.vote).toEqual({ yourVote: c.id, voted: 2, total: 6 });
    const cView = view(game, c);
    expect(cView.vote?.yourVote).toBeNull();
    expect(JSON.stringify(cView)).not.toContain('"votes"');

    game.wait(31);
    expect(view(game, c).verdict?.votes).toHaveLength(2);
  });

  it('shows a hanged player\'s role to everyone but still hides the rest', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    game.wait(181);
    const living = game.players.filter((p) => p.alive);
    const target = living.find((p) => p.role !== 'mafia') as Player;
    for (const p of living) {
      if (p.id !== target.id) game.act(p, { type: 'vote', targetId: target.id });
    }
    game.act(target, { type: 'vote', targetId: 'abstain' });
    const watcher = living.find((p) => p.id !== target.id && p.role === 'townsperson') ?? (living.find((p) => p.id !== target.id) as Player);
    const v = view(game, watcher);
    expect(v.verdict?.hangedRole).toBe(target.role);
    expect(v.players.find((p) => p.id === target.id)?.role).toBe(target.role);
    expect(v.players.filter((p) => p.id !== target.id && p.id !== watcher.id).every((p) => p.role === undefined || p.role === 'mafia')).toBe(true);
  });

  it('only shows every role once the game has ended', () => {
    const game = makeAtNight(6, 11);
    game.room.phase = 'end';
    game.room.winner = 'town';
    const v = view(game, game.players[1] as Player);
    expect(v.end?.roles).toHaveLength(6);
    expect(v.players.every((p) => p.role !== undefined)).toBe(true);
  });
});

describe('view contents', () => {
  it('returns null for someone who is not in the room', () => {
    const game = makeLobby(5);
    expect(viewFor(game.room, 'ghost', game.ctx)).toBeNull();
  });

  it('shows role-phase progress without revealing which roles', () => {
    const game = makeStarted(6);
    game.act(game.players[0] as Player, { type: 'ready' });
    const v = view(game, game.players[1] as Player);
    expect(v.roleProgress).toEqual({ seen: 1, total: 6 });
  });

  it('flags the host and lists readable channels', () => {
    const game = makeLobby(5);
    expect(view(game, game.players[0] as Player).you.isHost).toBe(true);
    expect(view(game, game.players[1] as Player).you.isHost).toBe(false);
    expect(view(game, game.players[1] as Player).chat.readable).toEqual(['lobby']);
  });

  it('lets only the dead read the graveyard', () => {
    const game = makeAtNight(7);
    const victim = game.byRole('townsperson')[0] as Player;
    nightKill(game, victim);
    expect(view(game, victim).chat.readable).toContain('graveyard');
    const living = game.players.find((p) => p.alive) as Player;
    expect(view(game, living).chat.readable).not.toContain('graveyard');
    expect(view(game, living).chat.messages.graveyard).toBeUndefined();
  });

  it('tallies accusations by day', () => {
    const game = makeAtNight(7);
    nightKill(game, game.byRole('townsperson')[0] as Player);
    const [a, b, c] = game.players.filter((p) => p.alive) as [Player, Player, Player];
    game.act(a, { type: 'accuse', targetId: c.id });
    game.act(b, { type: 'accuse', targetId: c.id });
    const v = view(game, a);
    expect(v.day?.accusations).toEqual({ [c.id]: 2 });
    expect(v.day?.yourAccuse).toBe(c.id);
    expect(v.day?.skipNeeded).toBe(4);
  });
});
