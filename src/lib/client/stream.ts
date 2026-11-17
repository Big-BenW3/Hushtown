/**
 * Live connection to a room.
 *
 * Uses `fetch` streaming instead of `EventSource` so the bearer token travels
 * in a header (never in a URL). Reconnects automatically with exponential
 * backoff and jitter, and treats a silent connection as dead.
 */
import type { PlayerView } from '@/lib/game/types';
import { ApiError, type Session } from './api';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

export interface StreamHandlers {
  onView: (view: PlayerView) => void;
  onStatus: (status: StreamStatus) => void;
  /** The seat is gone or the room no longer exists: retrying cannot help. */
  onFatal: (error: ApiError) => void;
}

export interface SseEvent {
  event: string;
  data: string;
}

/** Incremental Server-Sent Events parser. Feed it text chunks as they arrive. */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const events: SseEvent[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const parsed = parseBlock(block);
      if (parsed) events.push(parsed);
      boundary = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':') || line === '') continue; // comment / heartbeat
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/** Delay before reconnect attempt `attempt` (0-based): 0.5s doubling to 8s, plus jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return Math.round(base * (0.75 + random() * 0.5));
}

/** If nothing (not even a heartbeat) arrives for this long, assume the link died. */
const SILENCE_LIMIT_MS = 40_000;

export function connectRoomStream(session: Session, handlers: StreamHandlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const scheduleRetry = () => {
    if (stopped) return;
    handlers.onStatus('reconnecting');
    retryTimer = setTimeout(run, backoffDelay(attempt++));
  };

  async function run() {
    if (stopped) return;
    controller = new AbortController();
    const { signal } = controller;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => controller?.abort(), SILENCE_LIMIT_MS);
    };

    try {
      resetWatchdog();
      const response = await fetch(`/api/rooms/${session.code}/events`, {
        headers: { Authorization: `Bearer ${session.token}`, Accept: 'text/event-stream' },
        signal,
        cache: 'no-store',
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { code: never; message: string } } | null;
        const error = new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'Connection failed.', response.status);
        if (response.status === 401 || response.status === 404) {
          handlers.onFatal(error);
          stopped = true;
          return;
        }
        throw error;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resetWatchdog();
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          if (message.event !== 'state') continue;
          attempt = 0;
          handlers.onStatus('live');
          try {
            handlers.onView(JSON.parse(message.data) as PlayerView);
          } catch {
            /* ignore a malformed frame; the next one carries full state */
          }
        }
      }
    } catch {
      /* network error or abort: fall through to retry */
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
    scheduleRetry();
  }

  void run();

  return () => {
    stopped = true;
    controller?.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}
