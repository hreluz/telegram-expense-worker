# Telegram Expense Worker

A Cloudflare Worker that acts as a Telegram bot webhook for tracking personal expenses. Messages are parsed and stored in a Neon (serverless PostgreSQL) database.

## How it works

The worker receives POST requests from the Telegram Bot API. Each message is parsed as an expense entry and saved to the database, scoped to the Telegram user ID.

**Log an expense** — send a message in the format:

```
<amount> <category> [note]
```

Examples:
```
300 gym
45.50 groceries weekly shopping
12 coffee
```

Categories are created automatically and stored in lowercase, so `GYM`, `Gym`, and `gym` all map to the same category.

**List recent expenses** — send `/list` to get your last 10 entries.

**Export all expenses** — send `/report` to receive a CSV of your full history.

**Initialize the database** — send `/migrate` to create the tables (admin only).

**Drop pending Telegram updates** — send `/droppending` to flush Telegram's webhook retry queue (admin only).

## Stack

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime
- [Neon](https://neon.tech/) — serverless PostgreSQL
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — deployment CLI
- TypeScript

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database tables

Send `/migrate` from Telegram (you must be listed in `ADMIN_IDS`). Alternatively, run the DDL manually in your Neon console:

```sql
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Configure environment variables

Create a `.dev.vars` file for local development:

```
DATABASE_URL=your_neon_connection_string
TELEGRAM_TOKEN=your_telegram_bot_token
ADMIN_IDS=your_telegram_user_id
```

`ADMIN_IDS` is a comma-separated list of Telegram user IDs permitted to run `/migrate` and `/droppending`.

## Development

```bash
npm run dev      # start local dev server
npm test         # run tests
```

## Deploy

### 1. Set production secrets

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put ADMIN_IDS
```

### 2. Deploy the worker

```bash
npm run deploy
```

Wrangler will print the deployed URL, e.g. `https://telegram-expense-worker.<your-subdomain>.workers.dev`.

### 3. Register the Telegram webhook

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker>.workers.dev"
```

### 4. Verify

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

The response should show your Worker URL and `"pending_update_count": 0`.
