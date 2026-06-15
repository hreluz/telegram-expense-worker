# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Node version

This project uses Node.js v24.14.1. Switch to it before running any commands:

```bash
nvm use v24.14.1
```

## Commands

```bash
npm run dev      # local dev server (wrangler dev, port 8787)
npm test         # run all tests
npm run deploy   # deploy to Cloudflare Workers
npm run cf-typegen  # regenerate worker-configuration.d.ts from wrangler.jsonc
```

Run a single test file:
```bash
npx vitest run test/handlers.spec.ts
```

Run tests matching a name:
```bash
npx vitest run -t "parseExpense"
```

## Architecture

This is a Cloudflare Worker acting as a Telegram bot webhook. Telegram POSTs updates to the worker; the worker processes the message and replies via the Telegram Bot API.

### Layer structure

```
src/types.ts     — shared types: Env, TelegramBody, Expense, Sql
src/db.ts        — data access: fetchReport, fetchRecent, saveExpense (all SQL lives here)
src/telegram.ts  — outbound API: sendTelegramMessage
src/handlers.ts  — command logic: parseExpense + one handler per command
src/index.ts     — worker entry point: parse body, guard, dispatch to handler
```

Each layer only imports from layers below it. `index.ts` knows about handlers; handlers know about `db` and `telegram`; neither knows about each other.

### Adding a new command

1. Add a query function in `src/db.ts`
2. Add a handler in `src/handlers.ts` (call db, call `sendTelegramMessage`, return `Response.json`)
3. Add one `if (text === "/command")` line in `src/index.ts`
4. Add tests in the corresponding spec files

### Message format

Expense messages follow `<amount> <category> [note]`. Parsed by `parseExpense` in `handlers.ts` — throws with user-facing error messages on invalid input, which are caught and forwarded to the user via Telegram.

## Environment variables

Both are required at runtime. For local dev, define them in `.dev.vars` (gitignored):

```
DATABASE_URL=your_neon_connection_string
TELEGRAM_TOKEN=your_telegram_bot_token
```

For production, set via `wrangler secret put DATABASE_URL` and `wrangler secret put TELEGRAM_TOKEN`.

## Testing

Tests run inside a miniflare (Cloudflare Workers) environment via `@cloudflare/vitest-pool-workers`. This means standard Node.js APIs may not be available — use Workers-compatible APIs.

**Mocking pattern** — always use `vi.hoisted()` for mocks that need to be referenced in `vi.mock()` factories, since `vi.mock` is hoisted before variable declarations:

```ts
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/db", () => ({ fetchReport: mockFn }));
```

**Reset pattern** — use a top-level `beforeEach` to reset mock return values. `vi.clearAllMocks()` only clears call history, not implementations — always re-set `.mockResolvedValue(...)` in `beforeEach` to prevent bleed between tests.

**Test structure per layer:**
- `test/db.spec.ts` — passes a mock sql function directly; verifies each function calls sql and returns its result
- `test/handlers.spec.ts` — mocks `../src/db` and `../src/telegram`; tests response shape and Telegram message content
- `test/index.spec.ts` — mocks `@neondatabase/serverless` and `../src/telegram`; tests routing and HTTP-level behaviour
- `test/telegram.spec.ts` — stubs global `fetch`; verifies URL and request body

## Database schema

```sql
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Local end-to-end testing

Simulate a Telegram webhook POST against the local dev server:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"message": {"text": "300 gym", "from": {"id": YOUR_CHAT_ID}}}'
```

To test the full Telegram reply flow, expose the local server with `cloudflared tunnel --url http://localhost:8787` and register the tunnel URL as the bot webhook.

## Code style

Prettier is configured with tabs, single quotes, semicolons, print width 140. TypeScript strict mode is on.
