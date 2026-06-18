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
src/types.ts              — shared types: Env, TelegramBody, Expense, Sql
src/db.ts                 — barrel re-export of src/db/*
src/db/expenses.ts        — fetchReport, fetchRecent, saveExpense, deleteExpense, deleteLatestExpense, fetchBiggestExpense
src/db/categories.ts      — fetchCategoryTotals
src/db/logs.ts            — migrate, saveLog, fetchLogs
src/db/budgets.ts         — setBudget, removeBudget, fetchBudgets, fetchBudgetForCategory
src/telegram.ts           — outbound API: sendTelegramMessage, dropPendingUpdates, setTelegramCommands
src/handlers/utils.ts     — shared helpers: trySend, validateFilter, parseExpense, HELP_TEXT, date utilities
src/handlers/admin.ts     — handleMigrate, handleLogs, handleDropPending (imports from utils)
src/handlers.ts           — expense handlers + barrel re-export of handlers/utils and handlers/admin
src/index.ts              — worker entry point: parse body, guard, dispatch to handler
```

Each layer only imports from layers below it. `index.ts` knows about handlers; handlers know about `db` and `telegram`; neither knows about each other.

### Available commands

- `/start`, `/help` — send `HELP_TEXT` (format, examples, command list); `/start` is the entry point for new users
- `/list [categories|expenses] [filter]` — last 10 expenses with IDs and a header row (default view `expenses`); with a date filter (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`) returns all matching expenses with no limit. With `categories` view, returns per-category totals as a text message instead.
- `/report [categories|expenses] [filter]` — full history as a `.csv` file attachment; same date filter syntax scopes the export. With `categories` view, sends category totals CSV (e.g. `categories-2026-05.csv`); with `expenses` view, names the file `expenses-2026-05.csv`.
- `/budget <category> <amount>` — set a monthly budget for a category (upsert). `/budget <category> off` removes it. `/budget` with no args lists all budgets. Stored by category name in the `budgets` table so budgets can be set before any expenses exist.
- `/undo` — delete the most recently added expense (scoped to the current user). Same orphan-category cleanup as `/delete`.
- `/delete <id>` — delete an expense by ID (scoped to the current user). If the deleted expense was the last one in its category, the category is auto-deleted too.
- `/summary` — spending snapshot for the current month: total, vs. last month (with % change), top 3 categories, and biggest single expense. Uses `fetchCategoryTotals` (twice — current and previous month) and `fetchBiggestExpense` from `db.ts`.
- `/migrate` — create DB tables + register bot commands menu via `setTelegramCommands` (admin only)
- `/logs` — last 10 error log entries (admin only)
- `/droppending` — flush Telegram's webhook retry queue (admin only)

### Adding a new command

1. Add a query function in the appropriate `src/db/*.ts` file (expenses, categories, or logs)
2. Add the handler in `src/handlers.ts` (expense commands) or `src/handlers/admin.ts` (admin commands)
3. Add one `if (text === "/command")` line in `src/index.ts`
4. If user-facing, add it to `HELP_TEXT` in `src/handlers/utils.ts` and the `commands` array in `setTelegramCommands` in `src/telegram.ts`
5. Add tests in the corresponding spec files (`test/handlers.spec.ts`, `test/handlers/admin.spec.ts`, or `test/handlers/utils.spec.ts`)

### Message format

Expense messages follow `<amount> <category> [@YYYY-MM-DD] [note]`. Parsed by `parseExpense` in `src/handlers/utils.ts` — throws with user-facing error messages on invalid input, which are caught and forwarded to the user via Telegram. The `@date` token is optional and can appear anywhere after the category; if absent, `expenseDate` defaults to today. The category is lowercased before storage so `GYM` and `gym` resolve to the same `categories` row.

## Environment variables

All three are required at runtime. For local dev, define them in `.dev.vars` (gitignored):

```
DATABASE_URL=your_neon_connection_string
TELEGRAM_TOKEN=your_telegram_bot_token
ADMIN_IDS=123456789,987654321
```

`ADMIN_IDS` is a comma-separated list of Telegram user IDs allowed to run `/migrate` and `/droppending`.

For production, set via `wrangler secret put DATABASE_URL`, `wrangler secret put TELEGRAM_TOKEN`, and `wrangler secret put ADMIN_IDS`.

## Testing

Tests run inside a miniflare (Cloudflare Workers) environment via `@cloudflare/vitest-pool-workers`. This means standard Node.js APIs may not be available — use Workers-compatible APIs.

**Mocking pattern** — always use `vi.hoisted()` for mocks that need to be referenced in `vi.mock()` factories, since `vi.mock` is hoisted before variable declarations:

```ts
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/db", () => ({ fetchReport: mockFn }));
```

**Reset pattern** — use a top-level `beforeEach` that calls `vi.clearAllMocks()` (clears call history) followed by re-setting `.mockResolvedValue(...)` on each mock (restores implementations). Both steps are needed: `vi.clearAllMocks()` alone leaves stale return values; re-setting alone leaves stale call history that breaks `toHaveBeenCalledOnce` and `not.toHaveBeenCalled` assertions.

**Test structure per layer:**
- `test/db.spec.ts` — passes a mock sql function directly; verifies each function calls sql and returns its result
- `test/handlers/utils.spec.ts` — tests `parseExpense` (pure function, no mocks needed)
- `test/handlers/admin.spec.ts` — mocks `../../src/db` and `../../src/telegram`; tests admin handlers
- `test/handlers.spec.ts` — mocks `../src/db` and `../src/telegram`; tests expense handler response shape and Telegram message content
- `test/index.spec.ts` — mocks `@neondatabase/serverless` and `../src/telegram`; tests routing and HTTP-level behaviour
- `test/telegram.spec.ts` — stubs global `fetch`; verifies URL and request body

## Database schema

```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (telegram_user_id, name)
);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  UNIQUE (telegram_user_id, category)
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

## HTTP response status

**Always return 200** — for everything: user errors, invalid commands, not found, unauthorized, and infrastructure failures. Telegram retries any non-200 response, which causes the bot to send duplicate messages to the user in a loop.

Never use 400, 403, 404, or 500 in handlers. All errors — including DB failures and Telegram API errors — are sent to the user as a Telegram message and logged via `saveLog`. The HTTP response always has status 200.

## Code style

Prettier is configured with tabs, single quotes, semicolons, print width 140. TypeScript strict mode is on.
