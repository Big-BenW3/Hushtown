// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatDock, dockChannels } from '@/components/ChatDock';
import { CHAT_MAX_LENGTH } from '@/lib/game/config';
import type { Player } from '@/lib/game/types';
import { advanceTo, makeAtNight, makeLobby, makeSend, makeStarted, viewOf } from './fixtures';

const textbox = () => screen.getByRole('textbox', { name: 'Message' });

describe('ChatDock: wait room', () => {
  it('sends a trimmed message and clears the box afterwards', async () => {
    const game = makeLobby(5);
    const send = makeSend();
    render(<ChatDock view={viewOf(game, game.players[1] as Player)} send={send} />);
    expect(screen.getByRole('region', { name: 'Wait Room' })).toBeInTheDocument();
    await userEvent.type(textbox(), '  hello town  ');
    await userEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(send).toHaveBeenCalledWith({ type: 'chat', channel: 'lobby', text: 'hello town' });
    expect(textbox()).toHaveValue('');
  });

  it('keeps what you typed when the server refuses the message', async () => {
    const game = makeLobby(5);
    render(<ChatDock view={viewOf(game, game.players[1] as Player)} send={makeSend(false)} />);
    await userEvent.type(textbox(), 'try again');
    await userEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(textbox()).toHaveValue('try again');
  });

  it('does not allow sending a blank message', async () => {
    const game = makeLobby(5);
    const send = makeSend();
    render(<ChatDock view={viewOf(game, game.players[1] as Player)} send={send} />);
    expect(screen.getByRole('button', { name: 'SEND' })).toBeDisabled();
    await userEvent.type(textbox(), '   ');
    expect(screen.getByRole('button', { name: 'SEND' })).toBeDisabled();
    fireEvent.submit(textbox().closest('form') as HTMLFormElement);
    expect(send).not.toHaveBeenCalled();
  });

  it('caps the input at the server limit', () => {
    const game = makeLobby(5);
    render(<ChatDock view={viewOf(game, game.players[1] as Player)} send={makeSend()} />);
    expect(textbox()).toHaveAttribute('maxlength', String(CHAT_MAX_LENGTH));
  });

  it('renders message text as text, never as markup', () => {
    const game = makeLobby(5);
    const view = viewOf(game, game.players[1] as Player);
    view.chat.messages.lobby = [
      { id: 999, channel: 'lobby', kind: 'text', authorId: 'x', authorName: '<b>Eve</b>', text: '<img src=x onerror=alert(1)>', at: 0 },
    ];
    const { container } = render(<ChatDock view={view} send={makeSend()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<b>Eve</b>')).toBeInTheDocument();
  });

  it('marks your own messages', () => {
    const game = makeLobby(5);
    const me = game.players[1] as Player;
    game.act(me, { type: 'chat', channel: 'lobby', text: 'mine' });
    render(<ChatDock view={viewOf(game, me)} send={makeSend()} />);
    expect(screen.getByText('mine').closest('li')).toHaveClass('msg--mine');
  });
});

describe('ChatDock: day and night', () => {
  it('shows the town square by day with a pinned note and quick reactions', async () => {
    const game = advanceTo(makeStarted(6, 5), 'day');
    const me = game.players.find((p) => p.alive) as Player;
    const send = makeSend();
    render(<ChatDock view={viewOf(game, me)} send={send} />);
    expect(screen.getByRole('region', { name: 'Town Square' })).toBeInTheDocument();
    expect(screen.getByText(/PINNED/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: 'Reactions' })).getByRole('button', { name: 'SUS' }));
    expect(send).toHaveBeenCalledWith({ type: 'react', reaction: 'sus' });
  });

  it('closes the town square in silent mode', () => {
    const game = makeStarted(6, 5);
    game.room.mode = 'silent';
    advanceTo(game, 'day');
    const me = game.players.find((p) => p.alive) as Player;
    render(<ChatDock view={viewOf(game, me)} send={makeSend()} />);
    expect(textbox()).toBeDisabled();
    expect(screen.getByText(/Silent mode/)).toBeInTheDocument();
  });

  it('opens the den for the mafia at night and sends to the mafia channel', async () => {
    const game = makeAtNight(8);
    const mafia = game.byRole('mafia')[0] as Player;
    const send = makeSend();
    render(<ChatDock view={viewOf(game, mafia)} send={send} />);
    expect(screen.getByRole('region', { name: 'The Den' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lay low' }));
    expect(send).toHaveBeenCalledWith({ type: 'chat', channel: 'mafia', text: 'Lay low' });
  });

  it('keeps the den shut for everyone who is not mafia', () => {
    const game = makeAtNight(8);
    for (const p of game.players.filter((x) => x.role !== 'mafia')) {
      const view = viewOf(game, p);
      expect(dockChannels(view)).not.toContain('mafia');
      const { unmount } = render(<ChatDock view={view} send={makeSend()} />);
      expect(screen.queryByRole('region', { name: 'The Den' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('says the den is silent when only one mafia is left', () => {
    const game = makeAtNight(6);
    const mafia = game.byRole('mafia')[0] as Player;
    render(<ChatDock view={viewOf(game, mafia)} send={makeSend()} />);
    expect(screen.getByText(/only one left/i)).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
  });

  it('hides the den by day even for the mafia', () => {
    const game = advanceTo(makeStarted(8, 4), 'day');
    for (const m of game.byRole('mafia').filter((p) => p.alive)) {
      expect(dockChannels(viewOf(game, m))).not.toContain('mafia');
    }
  });
});

describe('ChatDock: graveyard', () => {
  it('gives the dead a graveyard they can switch away from', async () => {
    const game = advanceTo(makeStarted(6, 5), 'day');
    const ghost = game.players.find((p) => p.alive) as Player;
    ghost.alive = false;
    const send = makeSend();
    render(<ChatDock view={viewOf(game, ghost)} send={send} />);
    expect(screen.getByRole('region', { name: 'Graveyard' })).toBeInTheDocument();
    await userEvent.type(textbox(), 'boo');
    await userEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(send).toHaveBeenCalledWith({ type: 'chat', channel: 'graveyard', text: 'boo' });

    await userEvent.click(screen.getByRole('tab', { name: 'Town Square' }));
    expect(screen.getByRole('region', { name: 'Town Square' })).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
    expect(screen.getByText(/cannot speak to the living/i)).toBeInTheDocument();
  });

  it('never shows the graveyard to the living', () => {
    const game = advanceTo(makeStarted(6, 5), 'day');
    for (const p of game.players.filter((x) => x.alive)) expect(dockChannels(viewOf(game, p))).not.toContain('graveyard');
  });
});
