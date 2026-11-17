/** Stable machine-readable error codes returned by the API. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'ROOM_FULL'
  | 'SERVER_BUSY'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  ROOM_FULL: 409,
  SERVER_BUSY: 503,
  INTERNAL: 500,
};

/**
 * An expected, user-facing failure. Anything that is *not* a `GameError`
 * is treated as a bug and reported to the client as a generic 500.
 */
export class GameError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.status = STATUS[code];
  }
}
