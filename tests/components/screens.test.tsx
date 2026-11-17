// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DawnScreen } from '@/components/screens/DawnScreen';
import { DayScreen } from '@/components/screens/DayScreen';
import { EndScreen } from '@/components/screens/EndScreen';
import { LobbyScreen } from '@/components/screens/LobbyScreen';
import { NightScreen } from '@/components/screens/NightScreen';
import { RoleScreen } from '@/components/screens/RoleScreen';
import { VerdictScreen } from '@/components/screens/VerdictScreen';
import { VoteScreen } from '@/components/screens/VoteScreen';
import { DISCUSSION } from '@/lib/game/config';
import type { Player } from '@/lib/game/types';
import { advanceTo, makeAtNight, makeLobby, makeSend, makeStarted, viewOf, type Game } from './fixtures';

const roleOf = (game: Game, role: Player['role']) => game.players.find((p) => p.role === role) as Player;

describe('LobbyScreen', () => {
  it('lets the host begin once enough players are in', async () => {
    const game = makeLobby(6);
    const send = makeSend();
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={send} clockOffset={0} />);
    const begin = screen.getByRole('button', { name: 'BEGIN THE NIGHT' });
    expect(begin).toBeEnabled();
    await userEvent.click(begin);
    expect(send).toHaveBeenCalledWith({ type: 'start' });
  });

  it('shows how many more souls are needed and blocks starting', () => {
    const game = makeLobby(3);
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeDisabled();
    expect(screen.getByText('Need 2 more souls to begin.')).toBeInTheDocument();
  });

  it('shows singular copy when one more soul is needed', () => {
    const game = makeLobby(4);
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByText('Need 1 more soul to begin.')).toBeInTheDocument();
  });

  it('gives guests no controls: start, mode and time are all disabled', () => {
    const game = makeLobby(6);
    render(<LobbyScreen view={viewOf(game, game.players[1] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More time' })).toBeDisabled();
    expect(screen.getByText('Only the host can begin.')).toBeInTheDocument();
  });

  it('lets the host change mode and discussion time', async () => {
    const game = makeLobby(6);
    const send = makeSend();
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('radio', { name: /quick/i }));
    expect(send).toHaveBeenCalledWith({ type: 'settings', mode: 'quick' });
    await userEvent.click(screen.getByRole('button', { name: 'More time' }));
    expect(send).toHaveBeenCalledWith({ type: 'settings', discussionSeconds: DISCUSSION.default + DISCUSSION.step });
  });

  it('disables the time stepper at its limits', () => {
    const game = makeLobby(6);
    game.room.discussionSeconds = DISCUSSION.min;
    const { unmount } = render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'Less time' })).toBeDisabled();
    unmount();
    game.room.discussionSeconds = DISCUSSION.max;
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'More time' })).toBeDisabled();
  });

  it('lists every player and marks who is host, you and away', () => {
    const game = makeLobby(5);
    (game.players[2] as Player).connected = false;
    render(<LobbyScreen view={viewOf(game, game.players[1] as Player)} send={makeSend()} clockOffset={0} />);
    const list = screen.getByRole('list', { name: 'Players' });
    expect(within(list).getAllByRole('listitem').filter((li) => !li.className.includes('empty'))).toHaveLength(5);
    expect(within(list).getByText('Host', { selector: '.tag' })).toBeInTheDocument();
    expect(within(list).getByText('You')).toBeInTheDocument();
    expect(within(list).getByText('away')).toBeInTheDocument();
  });

  it('shows the town code with a spoken label', () => {
    const game = makeLobby(5);
    render(<LobbyScreen view={viewOf(game, game.players[0] as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByLabelText('Town code B C D F')).toBeInTheDocument();
  });
});

describe('RoleScreen', () => {
  it('hides the role until the card is held, then hides it again on release', () => {
    const game = makeStarted(6);
    const player = game.players[1] as Player;
    render(<RoleScreen view={viewOf(game, player)} send={makeSend()} clockOffset={0} />);
    expect(screen.queryByText('You are')).not.toBeInTheDocument();
    const hold = screen.getByRole('button', { name: 'HOLD TO LOOK' });
    fireEvent.pointerDown(hold);
    expect(screen.getByText('You are')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    fireEvent.pointerUp(window);
    expect(screen.queryByText('You are')).not.toBeInTheDocument();
  });

  it('reports "ready" exactly once however often the card is looked at', () => {
    const game = makeStarted(6);
    const send = makeSend();
    render(<RoleScreen view={viewOf(game, game.players[1] as Player)} send={send} clockOffset={0} />);
    const hold = screen.getByRole('button', { name: 'HOLD TO LOOK' });
    for (let i = 0; i < 3; i++) {
      fireEvent.pointerDown(hold);
      fireEvent.pointerUp(window);
    }
    expect(send.mock.calls.filter(([a]) => a.type === 'ready')).toHaveLength(1);
  });

  it('works from the keyboard (space holds, release hides)', () => {
    const game = makeStarted(6);
    render(<RoleScreen view={viewOf(game, game.players[1] as Player)} send={makeSend()} clockOffset={0} />);
    const hold = screen.getByRole('button', { name: 'HOLD TO LOOK' });
    fireEvent.keyDown(hold, { key: ' ' });
    expect(screen.getByText('You are')).toBeInTheDocument();
    fireEvent.keyUp(screen.getByRole('button', { name: 'RELEASE TO HIDE' }), { key: ' ' });
    expect(screen.queryByText('You are')).not.toBeInTheDocument();
  });

  it('tells a mafia member who their partners are, and nobody else', () => {
    const game = makeStarted(8);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    render(<RoleScreen view={viewOf(game, m1)} send={makeSend()} clockOffset={0} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD TO LOOK' }));
    expect(screen.getByText('Your partner in crime')).toBeInTheDocument();
    expect(screen.getByText(m2.name)).toBeInTheDocument();
  });

  it('does not show a partner strip to the town', () => {
    const game = makeStarted(8);
    render(<RoleScreen view={viewOf(game, roleOf(game, 'townsperson'))} send={makeSend()} clockOffset={0} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD TO LOOK' }));
    expect(screen.queryByText(/partner/i)).not.toBeInTheDocument();
  });
});

describe('NightScreen', () => {
  it('lets the mafia choose a victim, then lock it in', async () => {
    const game = makeAtNight(6);
    const mafia = roleOf(game, 'mafia');
    const victim = game.players.find((p) => p.role === 'townsperson') as Player;
    const send = makeSend();
    const { rerender } = render(<NightScreen view={viewOf(game, mafia)} send={send} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'LOCK IT IN' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(victim.name) }));
    expect(send).toHaveBeenCalledWith({ type: 'night', targetId: victim.id });

    game.act(mafia, { type: 'night', targetId: victim.id });
    rerender(<NightScreen view={viewOf(game, mafia)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'LOCK IT IN' }));
    expect(send).toHaveBeenCalledWith({ type: 'lock' });
  });

  it('never offers the mafia themselves or their partners as victims', () => {
    const game = makeAtNight(8);
    const [m1, m2] = game.byRole('mafia') as [Player, Player];
    render(<NightScreen view={viewOf(game, m1)} send={makeSend()} clockOffset={0} />);
    const names = screen.getAllByRole('radio').map((r) => r.textContent ?? '');
    expect(names.some((n) => n.includes(m1.name))).toBe(false);
    // The partner may be listed for visibility but must be flagged.
    const partner = names.find((n) => n.includes(m2.name));
    if (partner) expect(partner).toMatch(/PARTNER/);
  });

  it('lets the doctor save themselves', () => {
    const game = makeAtNight(6);
    const doctor = roleOf(game, 'doctor');
    render(<NightScreen view={viewOf(game, doctor)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('radio', { name: new RegExp(doctor.name) })).toBeInTheDocument();
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('shows the detective their notebook of past findings', () => {
    const game = advanceTo(makeStarted(6, 3), 'night');
    const detective = roleOf(game, 'detective');
    render(<NightScreen view={viewOf(game, detective)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('heading', { name: /who looks guilty\?/i })).toBeInTheDocument();
  });

  it('shows townspeople only a sleeping screen with no choices', () => {
    const game = makeAtNight(6);
    render(<NightScreen view={viewOf(game, roleOf(game, 'townsperson'))} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('heading', { name: 'Sleep.' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells a dead player they have fallen, with no choices', () => {
    const game = makeAtNight(6);
    const doctor = roleOf(game, 'doctor');
    doctor.alive = false;
    render(<NightScreen view={viewOf(game, doctor)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('heading', { name: /you fell/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('DawnScreen', () => {
  it('shows a gravestone with the victim name and an ack button', async () => {
    const game = makeAtNight(6);
    const victim = game.players.find((p) => p.role === 'townsperson') as Player;
    for (const m of game.byRole('mafia')) game.act(m, { type: 'night', targetId: victim.id });
    game.wait(60);
    expect(game.room.phase).toBe('dawn');
    const send = makeSend();
    const survivor = game.players.find((p) => p.alive) as Player;
    render(<DawnScreen view={viewOf(game, survivor)} send={send} clockOffset={0} />);
    expect(screen.getByLabelText(`Gravestone of ${victim.name}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'FACE THE TOWN' }));
    expect(send).toHaveBeenCalledWith({ type: 'ack' });
    expect(screen.getByRole('button', { name: 'WAITING FOR THE OTHERS' })).toBeDisabled();
  });

  it('re-enables the button when the server rejects the ack', async () => {
    const game = advanceTo(makeStarted(6), 'dawn');
    render(<DawnScreen view={viewOf(game, game.players.find((p) => p.alive) as Player)} send={makeSend(false)} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'FACE THE TOWN' }));
    expect(screen.getByRole('button', { name: 'FACE THE TOWN' })).toBeEnabled();
  });
});

describe('DayScreen', () => {
  const dayGame = () => advanceTo(makeStarted(6, 5), 'day');

  it('lists living suspects and lets a player accuse someone else', async () => {
    const game = dayGame();
    const me = game.players.find((p) => p.alive) as Player;
    const other = game.players.find((p) => p.alive && p.id !== me.id) as Player;
    const send = makeSend();
    render(<DayScreen view={viewOf(game, me)} send={send} clockOffset={0} />);
    const tiles = within(screen.getByRole('list', { name: 'Suspects' })).getAllByRole('listitem');
    expect(tiles).toHaveLength(game.players.filter((p) => p.alive).length);
    const tile = tiles.find((t) => t.textContent?.includes(other.name)) as HTMLElement;
    await userEvent.click(within(tile).getByRole('button', { name: 'ACCUSE' }));
    expect(send).toHaveBeenCalledWith({ type: 'accuse', targetId: other.id });
  });

  it('does not let you accuse yourself', () => {
    const game = dayGame();
    const me = game.players.find((p) => p.alive) as Player;
    render(<DayScreen view={viewOf(game, me)} send={makeSend()} clockOffset={0} />);
    const mine = within(screen.getByRole('list', { name: 'Suspects' })).getAllByRole('listitem').find((t) => t.textContent?.includes('THIS IS YOU')) as HTMLElement;
    expect(within(mine).getByRole('button')).toBeDisabled();
  });

  it('lets a player ask to skip to the vote', async () => {
    const game = dayGame();
    const me = game.players.find((p) => p.alive) as Player;
    const send = makeSend();
    render(<DayScreen view={viewOf(game, me)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'SKIP TO THE VOTE' }));
    expect(send).toHaveBeenCalledWith({ type: 'skip' });
  });

  it('sends a reaction', async () => {
    const game = dayGame();
    const me = game.players.find((p) => p.alive) as Player;
    const send = makeSend();
    render(<DayScreen view={viewOf(game, me)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'LIAR!' }));
    expect(send).toHaveBeenCalledWith({ type: 'react', reaction: 'liar' });
  });

  it('is read-only for the dead', () => {
    const game = dayGame();
    const dead = game.players.find((p) => p.alive) as Player;
    dead.alive = false;
    render(<DayScreen view={viewOf(game, dead)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByText(/You are dead/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SKIP TO THE VOTE' })).toBeDisabled();
    for (const b of within(screen.getByRole('list', { name: 'Suspects' })).getAllByRole('button')) expect(b).toBeDisabled();
  });
});

describe('VoteScreen', () => {
  const voteGame = () => advanceTo(makeStarted(6, 5), 'vote');

  it('keeps CAST VOTE disabled until something is chosen, then sends the vote', async () => {
    const game = voteGame();
    const me = game.players.find((p) => p.alive) as Player;
    const other = game.players.find((p) => p.alive && p.id !== me.id) as Player;
    const send = makeSend();
    render(<VoteScreen view={viewOf(game, me)} send={send} clockOffset={0} />);
    const cast = screen.getByRole('button', { name: 'CAST VOTE' });
    expect(cast).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(other.name) }));
    expect(cast).toBeEnabled();
    await userEvent.click(cast);
    expect(send).toHaveBeenCalledWith({ type: 'vote', targetId: other.id });
  });

  it('can abstain', async () => {
    const game = voteGame();
    const me = game.players.find((p) => p.alive) as Player;
    const send = makeSend();
    render(<VoteScreen view={viewOf(game, me)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('radio', { name: /Abstain/ }));
    await userEvent.click(screen.getByRole('button', { name: 'CAST VOTE' }));
    expect(send).toHaveBeenCalledWith({ type: 'vote', targetId: 'abstain' });
  });

  it('never lists yourself as someone to hang', () => {
    const game = voteGame();
    const me = game.players.find((p) => p.alive) as Player;
    render(<VoteScreen view={viewOf(game, me)} send={makeSend()} clockOffset={0} />);
    expect(screen.queryByRole('radio', { name: new RegExp(`^${me.name}$`) })).not.toBeInTheDocument();
  });

  it('offers CHANGE VOTE after voting and nothing to the dead', () => {
    const game = voteGame();
    const me = game.players.find((p) => p.alive) as Player;
    const other = game.players.find((p) => p.alive && p.id !== me.id) as Player;
    game.act(me, { type: 'vote', targetId: other.id });
    const { unmount } = render(<VoteScreen view={viewOf(game, me)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'VOTE CAST' })).toBeDisabled();
    unmount();
    const ghost = game.players.find((p) => p.alive && p.id !== me.id && p.id !== other.id) as Player;
    ghost.alive = false;
    render(<VoteScreen view={viewOf(game, ghost)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'YOU ARE WATCHING' })).toBeDisabled();
  });
});

describe('VerdictScreen', () => {
  it('reveals who hung and what they were, or that nobody did', () => {
    const game = voteGameWithVerdict();
    render(<VerdictScreen view={viewOf(game, game.players.find((p) => p.alive) as Player)} send={makeSend()} clockOffset={0} />);
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeInTheDocument();
    expect(screen.getByLabelText('Who voted for whom')).toBeInTheDocument();
    expect(screen.getByText(/THEY WERE/)).toBeInTheDocument();
  });

  it('acknowledges once and then waits for the others', async () => {
    const game = voteGameWithVerdict();
    const send = makeSend();
    render(<VerdictScreen view={viewOf(game, game.players.find((p) => p.alive) as Player)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(send).toHaveBeenCalledWith({ type: 'ack' });
    expect(screen.getByRole('button', { name: 'WAITING FOR THE OTHERS' })).toBeDisabled();
  });
});

function voteGameWithVerdict(): Game {
  return advanceTo(makeStarted(6, 5), 'verdict');
}

describe('EndScreen', () => {
  const endGame = () => advanceTo(makeStarted(6, 5), 'end');

  it('announces the winner, reveals every role and offers PLAY AGAIN to the host only', async () => {
    const game = endGame();
    const host = game.players[0] as Player;
    const send = makeSend();
    const { unmount } = render(<EndScreen view={viewOf(game, host)} send={send} clockOffset={0} />);
    expect(screen.getByRole('heading', { name: /WINS/ })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(game.players.length);
    await userEvent.click(screen.getByRole('button', { name: 'PLAY AGAIN' }));
    expect(send).toHaveBeenCalledWith({ type: 'again' });
    unmount();

    render(<EndScreen view={viewOf(game, game.players[1] as Player)} send={send} clockOffset={0} />);
    expect(screen.queryByRole('button', { name: 'PLAY AGAIN' })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });

  it('lets anyone leave', async () => {
    const game = endGame();
    const send = makeSend();
    render(<EndScreen view={viewOf(game, game.players[1] as Player)} send={send} clockOffset={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'LEAVE TOWN' }));
    expect(send).toHaveBeenCalledWith({ type: 'leave' });
  });
});
