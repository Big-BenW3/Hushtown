// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanCode, JoinForm } from '@/components/JoinForm';
import { ApiError } from '@/lib/client/api';
import { loadSession } from '@/lib/client/session';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const createRoom = vi.fn();
const joinRoom = vi.fn();
vi.mock('@/lib/client/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/client/api')>();
  return { ...original, api: { ...original.api, createRoom: (...a: unknown[]) => createRoom(...a), joinRoom: (...a: unknown[]) => joinRoom(...a) } };
});

beforeEach(() => {
  push.mockReset();
  createRoom.mockReset();
  joinRoom.mockReset();
  window.localStorage.clear();
});

const session = { code: 'BCDF', playerId: 'p1', token: 'tok' };

describe('cleanCode', () => {
  it('upper-cases, drops letters outside the alphabet and caps the length', () => {
    expect(cleanCode('bcdf')).toBe('BCDF');
    expect(cleanCode('a1e!b-c#dxyz')).toBe('BCDX');
    expect(cleanCode('  b c d f ')).toBe('BCDF');
    expect(cleanCode('')).toBe('');
    expect(cleanCode('aeiou')).toBe('');
  });
});

describe('JoinForm', () => {
  it('requires a name', async () => {
    render(<JoinForm initialCode="BCDF" />);
    await userEvent.click(screen.getByRole('button', { name: 'ENTER THE TOWN' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('requires a full four-letter code to join', async () => {
    render(<JoinForm initialCode="BC" />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'ENTER THE TOWN' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Room codes are four letters.');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('cleans the code as the player types', async () => {
    render(<JoinForm />);
    await userEvent.type(screen.getByLabelText('Room code'), 'b1c-d!f');
    expect(screen.getByLabelText('Room code')).toHaveValue('BCDF');
  });

  it('joins a town, remembers the seat and the name, and navigates to the room', async () => {
    joinRoom.mockResolvedValue(session);
    render(<JoinForm initialCode="bcdf" />);
    await userEvent.type(screen.getByLabelText('Your name'), '  Ada ');
    await userEvent.click(screen.getByRole('button', { name: 'ENTER THE TOWN' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/r/BCDF'));
    expect(joinRoom).toHaveBeenCalledWith('BCDF', 'Ada');
    expect(loadSession('BCDF')).toEqual(session);
    expect(window.localStorage.getItem('hushtown:name')).toBe('Ada');
  });

  it('creates a town in create mode and hides the code field', async () => {
    createRoom.mockResolvedValue(session);
    render(<JoinForm startInCreate />);
    expect(screen.queryByLabelText('Room code')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'START A TOWN' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/r/BCDF'));
    expect(createRoom).toHaveBeenCalledWith('Ada');
  });

  it('shows the server message when joining fails and stays on the page', async () => {
    joinRoom.mockRejectedValue(new ApiError('NOT_FOUND', 'No such town.', 404));
    render(<JoinForm initialCode="BCDF" />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'ENTER THE TOWN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No such town.');
    expect(push).not.toHaveBeenCalled();
    expect(loadSession('BCDF')).toBeNull();
    expect(screen.getByRole('button', { name: 'ENTER THE TOWN' })).toBeEnabled();
  });

  it('shows a generic message for unexpected errors without leaking details', async () => {
    joinRoom.mockRejectedValue(new Error('secret stack trace'));
    render(<JoinForm initialCode="BCDF" />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'ENTER THE TOWN' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).not.toHaveTextContent('secret');
  });

  it('ignores a second click while the first request is in flight', async () => {
    let resolve: (s: typeof session) => void = () => undefined;
    joinRoom.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<JoinForm initialCode="BCDF" />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Ada');
    const button = screen.getByRole('button', { name: 'ENTER THE TOWN' });
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'ONE MOMENT...' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'ONE MOMENT...' }));
    resolve(session);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(joinRoom).toHaveBeenCalledTimes(1);
  });

  it('switches between joining and creating', async () => {
    render(<JoinForm />);
    await userEvent.click(screen.getByRole('button', { name: 'or start a new town' }));
    expect(screen.getByRole('button', { name: 'START A TOWN' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'or join with a code' }));
    expect(screen.getByLabelText('Room code')).toBeInTheDocument();
  });

  it('prefills the last name used on this device', async () => {
    window.localStorage.setItem('hushtown:name', 'Bola');
    render(<JoinForm />);
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveValue('Bola'));
  });

  it('offers no create toggle in the compact landing strip', () => {
    render(<JoinForm strip />);
    expect(screen.queryByRole('button', { name: /new town/ })).not.toBeInTheDocument();
  });
});
