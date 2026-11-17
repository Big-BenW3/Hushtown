/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers parse loosely-typed JSON responses */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionHandler, createRoomHandler, eventsHandler, healthHandler, joinRoomHandler, snapshotHandler } from '@/lib/server/api';
import { RateLimiter } from '@/lib/server/rate-limit';
import { auth, get, makeDeps, params, post } from '../api-helpers';

type Json = Record<string, any>;
const read = async (response: Response): Promise<Json> => (await response.json()) as Json;

/** Creates a room through the real handlers and returns session info. */
async function createRoom(deps: ReturnType<typeof makeDeps>['deps'], name = 'Host') {
  const response = await createRoomHandler(deps)(post('/api/rooms', { name }));
  expect(response.status).toBe(201);
  return (await read(response)) as { code: string; playerId: string; token: string };
}

async function joinRoom(deps: ReturnType<typeof makeDeps>['deps'], code: string, name: string) {
  const response = await joinRoomHandler(deps)(post(`/api/rooms/${code}/join`, { name }), params(code));
  return { response, body: await read(response) };
}

async function act(deps: ReturnType<typeof makeDeps>['deps'], code: string, token: string, action: unknown) {
  return actionHandler(deps)(post(`/api/rooms/${code}/action`, action, auth(token)), params(code));
}

afterEach(() => vi.restoreAllMocks());

describe('POST /api/rooms', () => {
  it('creates a room and returns a session', async () => {
    const { deps } = makeDeps();
    const session = await createRoom(deps, 'Ada');
    expect(session.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(session.token).toHaveLength(32);
    expect(session.playerId).toMatch(/^[a-f0-9]{12}$/);
  });

  it.each([
    ['missing name', {}],
    ['empty name', { name: '' }],
    ['html in name', { name: '<img src=x onerror=alert(1)>' }],
    ['name too long', { name: 'A'.repeat(40) }],
    ['non-string name', { name: 42 }],
    ['unknown field', { name: 'Ada', isAdmin: true }],
  ])('rejects %s with 400', async (_label, body) => {
    const { deps } = makeDeps();
    const response = await createRoomHandler(deps)(post('/api/rooms', body));
    expect(response.status).toBe(400);
    expect((await read(response)).error.code).toBe('BAD_REQUEST');
  });

  it('rejects the wrong content type', async () => {
    const { deps } = makeDeps();
    const response = await createRoomHandler(deps)(post('/api/rooms', 'name=Ada', { 'content-type': 'text/plain' }));
    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const { deps } = makeDeps();
    const response = await createRoomHandler(deps)(post('/api/rooms', '{"name": '));
    expect(response.status).toBe(400);
    expect((await read(response)).error.message).toMatch(/json/i);
  });

  it('rejects an oversized body with 413, by header and by actual size', async () => {
    const { deps } = makeDeps();
    const big = JSON.stringify({ name: 'A', pad: 'x'.repeat(10_000) });
    const withHeader = await createRoomHandler(deps)(post('/api/rooms', big, { 'content-length': String(big.length) }));
    expect(withHeader.status).toBe(413);
    const lying = await createRoomHandler(deps)(post('/api/rooms', big, { 'content-length': '10' }));
    expect(lying.status).toBe(413);
  });

  it('returns 503 when the server is at capacity', async () => {
    const { deps } = makeDeps({ maxRooms: 1 });
    await createRoom(deps);
    const response = await createRoomHandler(deps)(post('/api/rooms', { name: 'Two' }));
    expect(response.status).toBe(503);
  });

  it('rate limits repeated creation from one client and does not affect others', async () => {
    const { deps } = makeDeps({}, { entry: new RateLimiter({ capacity: 2, refillPerSecond: 0 }) });
    const attempt = (ip: string) => createRoomHandler(deps)(post('/api/rooms', { name: 'Ada' }, { 'x-forwarded-for': ip }));
    expect((await attempt('1.1.1.1')).status).toBe(201);
    expect((await attempt('1.1.1.1')).status).toBe(201);
    const blocked = await attempt('1.1.1.1');
    expect(blocked.status).toBe(429);
    expect((await read(blocked)).error.code).toBe('RATE_LIMITED');
    expect((await attempt('2.2.2.2')).status).toBe(201);
  });

  it('has a global backstop when per-IP headers are spoofed', async () => {
    const { deps } = makeDeps({}, { global: new RateLimiter({ capacity: 2, refillPerSecond: 0 }) });
    const attempt = (i: number) => createRoomHandler(deps)(post('/api/rooms', { name: 'Ada' }, { 'x-forwarded-for': `9.9.9.${i}` }));
    expect((await attempt(1)).status).toBe(201);
    expect((await attempt(2)).status).toBe(201);
    expect((await attempt(3)).status).toBe(429);
  });

  it('sends no-store caching headers', async () => {
    const { deps } = makeDeps();
    const response = await createRoomHandler(deps)(post('/api/rooms', { name: 'Ada' }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/rooms/:code/join', () => {
  it('lets a player join with a fresh token', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    const { response, body } = await joinRoom(deps, host.code, 'Bob');
    expect(response.status).toBe(201);
    expect(body.token).not.toBe(host.token);
  });

  it('accepts lowercase room codes', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    const { response } = await joinRoom(deps, host.code.toLowerCase(), 'Bob');
    expect(response.status).toBe(201);
  });

  it('returns 404 for a room that does not exist', async () => {
    const { deps } = makeDeps();
    const { response } = await joinRoom(deps, 'ZZZZ', 'Bob');
    expect(response.status).toBe(404);
  });

  it.each(['abc', 'ABCDE', 'AEIOU', '<script>', '../../etc/passwd', '12345'])('rejects malformed code %j with 400', async (code) => {
    const { deps } = makeDeps();
    const response = await joinRoomHandler(deps)(post('/api/rooms/x/join', { name: 'Bob' }), params(code));
    expect(response.status).toBe(400);
  });

  it('rejects duplicate names with 409', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps, 'Ada');
    const { response } = await joinRoom(deps, host.code, 'ada');
    expect(response.status).toBe(409);
  });

  it('rejects a sixteenth player with 409 ROOM_FULL', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    for (let i = 1; i < 15; i++) expect((await joinRoom(deps, host.code, `P${i}`)).response.status).toBe(201);
    const { response, body } = await joinRoom(deps, host.code, 'Extra');
    expect(response.status).toBe(409);
    expect(body.error.code).toBe('ROOM_FULL');
  });

  it('rejects joining a game in progress with 409', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    for (let i = 1; i < 5; i++) await joinRoom(deps, host.code, `P${i}`);
    expect((await act(deps, host.code, host.token, { type: 'start' })).status).toBe(200);
    const { response } = await joinRoom(deps, host.code, 'Late');
    expect(response.status).toBe(409);
  });
});

describe('POST /api/rooms/:code/action', () => {
  async function started() {
    const ctx = makeDeps();
    const host = await createRoom(ctx.deps);
    const players = [host];
    for (let i = 1; i < 5; i++) players.push((await joinRoom(ctx.deps, host.code, `P${i}`)).body as any);
    return { ...ctx, host, players };
  }

  it('lets the host start a game with five players', async () => {
    const { deps, host, store } = await started();
    const response = await act(deps, host.code, host.token, { type: 'start' });
    expect(response.status).toBe(200);
    expect(store.peek(host.code)!.phase).toBe('role');
  });

  it('401 without a token, with a malformed token and with a wrong token', async () => {
    const { deps, host } = await started();
    const noAuth = await actionHandler(deps)(post(`/api/rooms/${host.code}/action`, { type: 'start' }), params(host.code));
    expect(noAuth.status).toBe(401);
    const malformed = await act(deps, host.code, 'short', { type: 'start' });
    expect(malformed.status).toBe(401);
    const wrong = await act(deps, host.code, 'a'.repeat(32), { type: 'start' });
    expect(wrong.status).toBe(401);
  });

  it('403 when a non-host tries to start', async () => {
    const { deps, host, players } = await started();
    const response = await act(deps, host.code, (players[1] as any).token, { type: 'start' });
    expect(response.status).toBe(403);
  });

  it('409 when starting with too few players', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    expect((await act(deps, host.code, host.token, { type: 'start' })).status).toBe(409);
  });

  it('409 for an action in the wrong phase', async () => {
    const { deps, host } = await started();
    expect((await act(deps, host.code, host.token, { type: 'vote', targetId: 'abstain' })).status).toBe(409);
  });

  it.each([
    ['unknown action', { type: 'nuke' }],
    ['extra fields', { type: 'start', force: true }],
    ['bad target id', { type: 'night', targetId: 'drop table' }],
    ['bad channel', { type: 'chat', channel: 'secret', text: 'hi' }],
    ['array body', []],
  ])('400 for %s', async (_label, body) => {
    const { deps, host } = await started();
    expect((await act(deps, host.code, host.token, body)).status).toBe(400);
  });

  it('404 for an unknown room and the token is not leaked', async () => {
    const { deps, host } = await started();
    const response = await act(deps, 'ZZZZ', host.token, { type: 'start' });
    expect(response.status).toBe(404);
    expect(JSON.stringify(await read(response))).not.toContain(host.token);
  });

  it('rate limits floods of actions per player', async () => {
    const { deps, host } = makeDeps({}, { action: new RateLimiter({ capacity: 3, refillPerSecond: 0 }) }) as any;
    const session = await createRoom(deps);
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await act(deps, session.code, session.token, { type: 'ready' })).status);
    expect(results.filter((s) => s === 429).length).toBe(2);
    void host;
  });

  it('chat: sanitises text and rejects floods with 429', async () => {
    const { deps, host, store } = await started();
    const ok = await act(deps, host.code, host.token, { type: 'chat', channel: 'lobby', text: '  hello   there ' });
    expect(ok.status).toBe(200);
    expect(store.peek(host.code)!.chat.at(-1)!.text).toBe('hello there');
    let limited = 0;
    for (let i = 0; i < 10; i++) {
      const r = await act(deps, host.code, host.token, { type: 'chat', channel: 'lobby', text: `m${i}` });
      if (r.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it('turns an unexpected exception into a generic 500 without leaking details', async () => {
    const { deps, host, store } = await started();
    vi.spyOn(store, 'act').mockImplementation(() => {
      throw new Error('SECRET database password in stack');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await act(deps, host.code, host.token, { type: 'start' });
    expect(response.status).toBe(500);
    const text = JSON.stringify(await read(response));
    expect(text).not.toContain('SECRET');
    expect(spy).toHaveBeenCalled();
  });
});

describe('GET /api/rooms/:code (snapshot)', () => {
  it('returns only the caller\'s view', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    const { body: bob } = await joinRoom(deps, host.code, 'Bob');
    const response = await snapshotHandler(deps)(get(`/api/rooms/${host.code}`, auth(bob.token)), params(host.code));
    const view = await read(response);
    expect(response.status).toBe(200);
    expect(view.you.name).toBe('Bob');
    expect(JSON.stringify(view)).not.toContain(host.token);
    expect(JSON.stringify(view)).not.toContain(bob.token);
  });

  it('401 without a valid token', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    const response = await snapshotHandler(deps)(get(`/api/rooms/${host.code}`), params(host.code));
    expect(response.status).toBe(401);
  });
});

describe('GET /api/rooms/:code/events (SSE)', () => {
  it('streams a snapshot then updates, and cleans up on abort', async () => {
    const { deps, store } = makeDeps();
    const host = await createRoom(deps);
    const controller = new AbortController();
    const response = await eventsHandler(deps)(get(`/api/rooms/${host.code}/events`, auth(host.token), controller.signal), params(host.code));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain('event: state');
    const firstView = JSON.parse(first.split('data: ')[1]!.split('\n')[0]!);
    expect(firstView.phase).toBe('lobby');
    expect(store.peek(host.code)!.players[0]!.connected).toBe(true);

    await joinRoom(deps, host.code, 'Bob');
    const second = decoder.decode((await reader.read()).value);
    expect(JSON.parse(second.split('data: ')[1]!.split('\n')[0]!).players).toHaveLength(2);

    controller.abort();
    await vi.waitFor(() => expect(store.peek(host.code)!.players[0]!.connected).toBe(false));
  });

  it('rejects bad auth before opening a stream', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    expect((await eventsHandler(deps)(get(`/api/rooms/${host.code}/events`), params(host.code))).status).toBe(401);
    expect((await eventsHandler(deps)(get('/api/rooms/ZZZZ/events', auth(host.token)), params('ZZZZ'))).status).toBe(404);
  });

  it('never accepts the token in the query string', async () => {
    const { deps } = makeDeps();
    const host = await createRoom(deps);
    const response = await eventsHandler(deps)(get(`/api/rooms/${host.code}/events?token=${host.token}`), params(host.code));
    expect(response.status).toBe(401);
  });
});

describe('GET /api/health', () => {
  it('reports ok and the room count', async () => {
    const { deps } = makeDeps();
    await createRoom(deps);
    const body = await read(await healthHandler(deps)());
    expect(body).toEqual({ ok: true, rooms: 1 });
  });
});
