// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRoom } from '@/components/GameRoom';
import { GameView } from '@/components/GameView';
import { ApiError } from '@/lib/client/api';
import { saveSession, loadSession } from '@/lib/client/session';
import type { RoomState } from '@/lib/client/useRoom';
import type { Player } from '@/lib/game/types';
import { advanceTo, makeAtNight, makeLobby, makeSend, makeStarted, viewOf } from './fixtures';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let room: RoomState;
vi.mock('@/lib/client/useRoom', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/client/useRoom')>();
  return { ...original, useRoom: () => room };
});

const baseRoom = (over: Partial<RoomState> = {}): RoomState => ({
  view: null,
  status: 'live',
  gone: null,
  clockOffset: 0,
  send: makeSend(),
  error: null,
  dismissError: vi.fn(),
  ...over,
});

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  window.localStorage.clear();
  room = baseRoom();
});

describe('GameRoom', () => {
  it('sends a visitor with no saved seat to the join screen with the code prefilled', () => {
    render(<GameRoom code="BCDF" />);
    expect(replace).toHaveBeenCalledWith('/play?code=BCDF');
  });

  it('shows a loading screen until the first state arrives', () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    render(<GameRoom code="BCDF" />);
    expect(screen.getByRole('heading', { name: /Entering the town/ })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains a lost seat and offers to join again', () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    room = baseRoom({ gone: new ApiError('NOT_FOUND', 'That town has gone quiet.', 404) });
    render(<GameRoom code="BCDF" />);
    expect(screen.getByRole('alert')).toHaveTextContent('That town has gone quiet.');
    expect(screen.getByRole('link', { name: 'JOIN AGAIN' })).toHaveAttribute('href', '/play?code=BCDF');
  });

  it('shows the lobby when the room is live', () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    const game = makeLobby(5);
    room = baseRoom({ view: viewOf(game, game.players[0] as Player) });
    render(<GameRoom code="BCDF" />);
    expect(screen.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeInTheDocument();
  });

  it('warns about a dropped connection without hiding the game', () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    const game = makeLobby(5);
    room = baseRoom({ view: viewOf(game, game.players[0] as Player), status: 'reconnecting' });
    render(<GameRoom code="BCDF" />);
    expect(screen.getByText(/CONNECTION LOST/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BEGIN THE NIGHT' })).toBeInTheDocument();
  });

  it('shows an action error as a toast that can be dismissed', async () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    const game = makeLobby(5);
    const dismissError = vi.fn();
    room = baseRoom({ view: viewOf(game, game.players[0] as Player), error: 'Too fast. Slow down.', dismissError });
    render(<GameRoom code="BCDF" />);
    await userEvent.click(screen.getByText('Too fast. Slow down.'));
    expect(dismissError).toHaveBeenCalled();
  });

  it('forgets the seat and goes home after leaving', async () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    const game = advanceTo(makeStarted(6, 5), 'end');
    room = baseRoom({ view: viewOf(game, game.players[1] as Player) });
    render(<GameRoom code="BCDF" />);
    await userEvent.click(screen.getByRole('button', { name: 'LEAVE TOWN' }));
    expect(loadSession('BCDF')).toBeNull();
    expect(push).toHaveBeenCalledWith('/');
  });

  it('keeps the seat if leaving failed', async () => {
    saveSession({ code: 'BCDF', playerId: 'p1', token: 't' });
    const game = advanceTo(makeStarted(6, 5), 'end');
    room = baseRoom({ view: viewOf(game, game.players[1] as Player), send: makeSend(false) });
    render(<GameRoom code="BCDF" />);
    await userEvent.click(screen.getByRole('button', { name: 'LEAVE TOWN' }));
    expect(loadSession('BCDF')).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('GameView phase routing', () => {
  const show = (game: ReturnType<typeof makeLobby>, player: Player) =>
    render(<GameView view={viewOf(game, player)} send={makeSend()} clockOffset={0} />);

  it('marks the stage with the current phase', () => {
    const game = makeLobby(5);
    const { container } = show(game, game.players[0] as Player);
    expect(container.querySelector('[data-phase="lobby"]')).not.toBeNull();
  });

  it('has no chat while roles are being revealed', () => {
    const game = makeStarted(6);
    show(game, game.players[1] as Player);
    expect(screen.getByRole('button', { name: 'HOLD TO LOOK' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('pairs the night screen with the den for mafia and with nothing for the town', () => {
    const game = makeAtNight(8);
    const { unmount } = show(game, game.byRole('mafia')[0] as Player);
    expect(screen.getByRole('region', { name: 'The Den' })).toBeInTheDocument();
    unmount();
    show(game, game.players.find((p) => p.role === 'townsperson') as Player);
    expect(screen.queryByRole('region', { name: 'The Den' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sleep.' })).toBeInTheDocument();
  });

  it.each(['dawn', 'day', 'vote', 'verdict', 'end'] as const)('renders the %s screen', (phase) => {
    const game = advanceTo(makeStarted(6, 5), phase);
    const viewer = game.players.find((p) => p.alive) ?? (game.players[0] as Player);
    const { container } = show(game, viewer);
    expect(container.querySelector(`[data-phase="${phase}"]`)).not.toBeNull();
    expect(container.querySelector('.screen')).not.toBeNull();
  });
});
