/** Small HTTP helpers shared by the route handlers. */
import { ZodError } from 'zod';
import { GameError } from '@/lib/game/errors';
import { tokenSchema } from '@/lib/validation/schemas';

export const MAX_BODY_BYTES = 4 * 1024;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof GameError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request.';
    return json({ error: { code: 'BAD_REQUEST', message } }, 400);
  }
  // A genuine bug: log it for operators, tell the client nothing about internals.
  console.error('[hushtown] unexpected error', error);
  return json({ error: { code: 'INTERNAL', message: 'Something broke on our side.' } }, 500);
}

/** Wraps a handler so any thrown error becomes a well-formed JSON response. */
export function guard<A extends unknown[]>(handler: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Reads and parses a small JSON body with strict size and content-type checks. */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new GameError('BAD_REQUEST', 'Content-Type must be application/json.');
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new GameError('PAYLOAD_TOO_LARGE', 'Request body is too large.');

  // Content-Length can lie or be absent, so also bound the bytes actually read.
  const reader = request.body?.getReader();
  if (!reader) throw new GameError('BAD_REQUEST', 'Request body is required.');
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new GameError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(value);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new GameError('BAD_REQUEST', 'Request body is not valid JSON.');
  }
}

/** Extracts the bearer token from the Authorization header. */
export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  const parsed = tokenSchema.safeParse(match?.[1]);
  if (!parsed.success) throw new GameError('UNAUTHORIZED', 'Missing or invalid session.');
  return parsed.data;
}

/**
 * Best-effort client identifier for rate limiting. Behind a proxy this is the
 * first `X-Forwarded-For` hop. A spoofed header can only weaken per-IP
 * limits, so a global limiter also backs them up.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || request.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}
