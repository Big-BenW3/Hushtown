/** Thin typed wrapper around the Hushtown HTTP API. */
import type { ErrorCode } from '@/lib/game/errors';
import type { Action } from '@/lib/game/types';

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;

  constructor(code: ErrorCode | 'NETWORK', message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', 0);
  }

  const body = (await response.json().catch(() => null)) as { error?: { code: ErrorCode; message: string } } | null;
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(error?.code ?? 'INTERNAL', error?.message ?? 'Something went wrong.', response.status);
  }
  return body as T;
}

const jsonInit = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

export const api = {
  createRoom: (name: string) => request<Session>('/api/rooms', jsonInit({ name })),
  joinRoom: (code: string, name: string) => request<Session>(`/api/rooms/${encodeURIComponent(code)}/join`, jsonInit({ name })),
  action: (session: Session, action: Action) =>
    request<{ ok: true }>(`/api/rooms/${session.code}/action`, jsonInit(action, session.token)),
};
