/**
 * HTTP handlers for the Hushtown API.
 *
 * Next.js route files re-export these so that logic stays testable with
 * plain `Request` objects and no framework runtime.
 */
import { GameError } from '@/lib/game/errors';
import type { PlayerView } from '@/lib/game/types';
import { actionSchema, createRoomBodySchema, joinRoomBodySchema, roomCodeSchema } from '@/lib/validation/schemas';
import { bearerToken, clientKey, guard, json, readJson } from './http';
import { RateLimiter } from './rate-limit';
import { getStore, type RoomStore } from './store';

/** Limiters are module-level singletons, but swappable for tests. */
export interface Limiters {
  /** Room creation and joining per client. */
  entry: RateLimiter;
  /** Backstop shared by everyone, in case per-IP keys are spoofed. */
  global: RateLimiter;
  /** Game actions per player. */
  action: RateLimiter;
}

export function createLimiters(): Limiters {
  return {
    // Generous enough for a whole house sharing one IP to join together.
    entry: new RateLimiter({ capacity: 30, refillPerSecond: 1 }),
    global: new RateLimiter({ capacity: 120, refillPerSecond: 10 }),
    action: new RateLimiter({ capacity: 20, refillPerSecond: 8 }),
  };
}

export interface ApiDeps {
  store: () => RoomStore;
  limiters: Limiters;
}

const defaultDeps: ApiDeps = { store: getStore, limiters: createLimiters() };

type Params = { params: Promise<{ code: string }> };

function throttleEntry(request: Request, deps: ApiDeps): void {
  const key = clientKey(request);
  if (!deps.limiters.entry.take(key) || !deps.limiters.global.take('global')) {
    throw new GameError('RATE_LIMITED', 'Too many attempts. Wait a moment and try again.');
  }
}

async function parseCode(params: Params['params']): Promise<string> {
  return roomCodeSchema.parse((await params).code);
}

/** POST /api/rooms: start a new town. */
export function createRoomHandler(deps: ApiDeps = defaultDeps) {
  return guard(async (request: Request) => {
    throttleEntry(request, deps);
    const { name } = createRoomBodySchema.parse(await readJson(request));
    const session = deps.store().createRoom(name);
    return json(session, 201);
  });
}

/** POST /api/rooms/:code/join: take a seat in an existing town. */
export function joinRoomHandler(deps: ApiDeps = defaultDeps) {
  return guard(async (request: Request, { params }: Params) => {
    throttleEntry(request, deps);
    const code = await parseCode(params);
    const { name } = joinRoomBodySchema.parse(await readJson(request));
    return json(deps.store().join(code, name), 201);
  });
}

/** POST /api/rooms/:code/action: do something in the game. */
export function actionHandler(deps: ApiDeps = defaultDeps) {
  return guard(async (request: Request, { params }: Params) => {
    const code = await parseCode(params);
    const token = bearerToken(request);
    if (!deps.limiters.action.take(token)) {
      throw new GameError('RATE_LIMITED', 'Slow down.');
    }
    const action = actionSchema.parse(await readJson(request));
    deps.store().act(code, token, action);
    return json({ ok: true });
  });
}

/** GET /api/rooms/:code: one-off snapshot of your own view (used for reconnect checks). */
export function snapshotHandler(deps: ApiDeps = defaultDeps) {
  return guard(async (request: Request, { params }: Params) => {
    const code = await parseCode(params);
    return json(deps.store().snapshot(code, bearerToken(request)));
  });
}

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/rooms/:code/events: Server-Sent Events stream of your view.
 *
 * The token travels in the Authorization header (the client uses fetch
 * streaming rather than `EventSource`) so it never appears in URLs or logs.
 */
export function eventsHandler(deps: ApiDeps = defaultDeps) {
  return guard(async (request: Request, { params }: Params) => {
    const code = await parseCode(params);
    const token = bearerToken(request);
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;

    const cleanup = () => {
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup(); // The client is gone; stop doing work for it.
          }
        };
        const send = (view: PlayerView) => write(`id: ${view.serverNow}\nevent: state\ndata: ${JSON.stringify(view)}\n\n`);

        // Throws GameError (401/404/429) before any bytes are sent; `guard` turns it into JSON.
        unsubscribe = deps.store().subscribe(code, token, send);
        heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
        request.signal.addEventListener('abort', () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel: cleanup,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}

/** GET /api/health: liveness probe with a little operational detail. */
export function healthHandler(deps: ApiDeps = defaultDeps) {
  return guard(() => json({ ok: true, rooms: deps.store().roomCount }));
}
