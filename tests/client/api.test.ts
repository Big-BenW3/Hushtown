import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/client/api';

const session = { code: 'BCDF', playerId: 'p1', token: 'secret-token' };

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('creates a room with a JSON body', async () => {
    const fetchMock = respond(201, session);
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.createRoom('Ada')).resolves.toEqual(session);
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/rooms');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Ada' });
  });

  it('url-encodes the room code when joining', async () => {
    const fetchMock = respond(200, session);
    vi.stubGlobal('fetch', fetchMock);
    await api.joinRoom('A/../B', 'Ada');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/rooms/A%2F..%2FB/join');
  });

  it('sends the token in the Authorization header and never in the URL', async () => {
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await api.action(session, { type: 'ack' });
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).not.toContain('secret-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('maps a server error body to an ApiError', async () => {
    vi.stubGlobal('fetch', respond(404, { error: { code: 'NOT_FOUND', message: 'No such town.' } }));
    const error = await api.joinRoom('BCDF', 'Ada').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'No such town.' });
  });

  it('survives a non-JSON error page (for example from a proxy)', async () => {
    vi.stubGlobal('fetch', respond(502, '<html>Bad gateway</html>'));
    const error = await api.createRoom('Ada').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502, message: 'Something went wrong.' });
  });

  it('turns a network failure into a friendly NETWORK error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await api.createRoom('Ada').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NETWORK', status: 0 });
    expect((error as Error).message).not.toContain('Failed to fetch');
  });
});
