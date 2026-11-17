# Hushtown

A realtime online Mafia game for 5 to 15 players. One phone each, no accounts.
Frontend and backend live in one Next.js project: pages under `src/app`, the game API as Next.js route handlers under `src/app/api`.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Open the site, press **Start a town**, and share the four-letter code (or the share link) with friends.
You need at least 5 players. On one machine you can open extra players in separate private windows.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, build, production |
| `npm run check` | Typecheck, lint, then all unit/API/component tests |
| `npm test` | Vitest: engine, validation, rate limiting, store, API handlers, client library, React components |
| `npm run test:e2e` | Playwright: real browsers against a production server (run `npm run build` first) |
| `npx playwright install chromium` | One-time browser download for the e2e tests |

The e2e server starts itself with `HUSHTOWN_TIME_SCALE=0.1`, which makes every timer ten times faster so a whole game takes seconds.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HUSHTOWN_TIME_SCALE` | `1` | Multiplies all phase timers. Use `0.1` for tests. Leave unset in production. |
| `HUSHTOWN_MAX_ROOMS` | `500` | Cap on simultaneous rooms (a full server answers 503 instead of falling over). |

## How a game flows

`lobby` -> `role` (hold to look at your card) -> `night` (mafia pick, doctor saves, detective investigates) -> `dawn` -> `day` (accuse, talk) -> `vote` -> `verdict` -> repeat until `end`.

Chat rooms: **Wait Room** (lobby), **Town Square** (day, everyone alive), **The Den** (mafia only, only at night, only while two or more mafia live), **Graveyard** (the dead).

## Architecture

```
src/lib/game        Pure game engine. No I/O, no clocks, no randomness of its own:
                    time, rng and ids are injected, so every rule is unit-testable.
src/lib/validation  Zod schemas for every request (strict: unknown fields are refused).
src/lib/server      In-memory RoomStore, rate limiter, HTTP helpers, route handler factories.
src/app/api         Thin route files that wire the handler factories to Next.js.
src/lib/client      fetch wrapper, session storage, SSE stream with reconnect, useRoom hook.
src/components      Screens (one per phase), chat dock, split layout, join form.
src/styles          Design tokens, components, per-screen and landing CSS.
tests               unit, api, client, components (Vitest) and e2e (Playwright).
```

The server is authoritative. Clients only send intents (`night`, `vote`, `chat`...). Each player gets their own redacted `PlayerView`, so roles, votes, doctor saves and tokens of other players are never sent to a browser that should not know them (tests assert this).

### Realtime

Server-Sent Events over `fetch` streaming (so the bearer token travels in a header, never in a URL). The client reconnects with exponential backoff and jitter, treats 40 seconds of silence as a dead link, and restores the seat from `localStorage` after a refresh.

### Keeping rooms alive

- A failing subscriber (closed tab, broken socket) is dropped without affecting anyone else.
- An error while ticking one room is caught and isolated; other rooms keep running.
- Players who disconnect keep their seat; in the lobby a seat that stays away for 60 seconds is released.
- Idle rooms are swept after 30 minutes; a room cap prevents memory exhaustion.
- Each player may hold at most 4 live connections.

## Security notes

- Every input is validated with strict Zod schemas (names, codes, action payloads). Names are normalised and reject control, zero-width and bidi-override characters. Chat is sanitised on the server and rendered as text by React.
- Bearer tokens are 256-bit random values, compared in constant time on a hash, accepted only in the `Authorization` header.
- Request bodies are limited to 4 KB (checked by header and by real byte count) and must be `application/json`.
- Token-bucket rate limits: per client for joining and creating, a global backstop, and per player token for actions.
- Unexpected errors return a generic 500 with no stack trace or internals.
- Security headers and a Content-Security-Policy are set in `next.config.mjs`; API responses are `no-store`.

## Known limits

- **Rooms live in the memory of one server process.** That is the right trade-off for a single instance (and for `npm run dev`), but it means you cannot run several instances behind a load balancer without sticky routing. The seam for changing this is `RoomStore` in `src/lib/server/store.ts`.
- A server restart ends all games.
- Rate limiting is per process and keyed on the client address, taken from `x-forwarded-for` when present. Put the app behind a proxy you control before exposing it publicly.
