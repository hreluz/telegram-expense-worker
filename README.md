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

**List recent expenses** — send `/list` to get your last 10 entries.

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

### 2. Create the database table

Run this in your Neon console (or any PostgreSQL client):

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

### 3. Configure environment variables

Create a `.dev.vars` file for local development:

```
DATABASE_URL=your_neon_connection_string
```

For production, set the secret via Wrangler:

```bash
wrangler secret put DATABASE_URL
```

### 4. Register the Telegram webhook

Point your bot's webhook to your deployed Worker URL:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
```

## Development

```bash
npm run dev      # start local dev server
npm test         # run tests
```

## Deploy

```bash
npm run deploy
```
