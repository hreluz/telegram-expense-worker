# Telegram Expense Worker

A Cloudflare Worker that acts as a Telegram bot webhook for tracking personal expenses. Messages are parsed and stored in a Neon (serverless PostgreSQL) database.

## How it works

The worker receives POST requests from the Telegram Bot API. Each message is parsed as an expense entry and saved to the database, scoped to the Telegram user ID.

**Log an expense** — send a message in the format:

```
<amount> <category> [@YYYY-MM-DD] [note]
```

Examples:
```
300 gym                                      # amount + category
45.50 groceries weekly shopping              # with note
300 gym @2026-06-10                          # with date
300 gym @2026-06-10 bought shoes             # with date and note
45.50 groceries @2026-06-10 weekly shopping  # date can appear anywhere after category
```

The `@date` token is optional and can appear anywhere after the category. If omitted, today's date is used. Categories are created automatically per user and stored in lowercase, so `GYM`, `Gym`, and `gym` all map to the same category.

**List recent expenses** — send `/list` to get your last 10 entries. Each row shows the expense ID (needed for `/delete`), date, amount, category, and note. Add a date filter to see all expenses for a period. Add `categories` to see totals grouped by category instead:

```
/list                        # last 10 expenses
/list 2026                   # all expenses in 2026
/list 2026-05                # all expenses in May 2026
/list 2026-05-01             # all expenses on a specific day
/list categories             # totals per category, all time
/list categories 2026-05     # totals per category for May 2026
```

Example output:
```
ID    Date        Amount    Category      Note
#42   2026-06-17  300.00    gym           bought shoes
#41   2026-06-15  45.50     groceries
#40   2026-06-10  12.00     coffee
```

**Export expenses as CSV** — send `/report` to receive your full history as a `.csv` file. Add a date filter to scope the export. Use `categories` to export totals grouped by category instead:

```
/report                        # all expenses           →  expenses.csv
/report 2026                   # expenses for 2026      →  expenses-2026.csv
/report 2026-05                # expenses for May       →  expenses-2026-05.csv
/report 2026-05-01             # expenses for a day     →  expenses-2026-05-01.csv
/report categories             # category totals        →  categories.csv
/report categories 2026-05     # category totals, May   →  categories-2026-05.csv
```

**Get a spending summary** — send `/summary` to see a snapshot of the current month: total spent, comparison to last month, top 3 categories (with budget vs actual if set), and the single biggest expense. Categories that exceed their budget are flagged with a warning.

**Set monthly budgets** — send `/budget` to set, remove, or list monthly spending limits per category:

```
/budget gym 500          # set a 500/month budget for gym
/budget gym off          # remove the gym budget
/budget                  # list all budgets
```

When you save an expense that tips a category over its budget, a warning is added to the confirmation message.

**Undo the last expense** — send `/undo` to delete the most recently added expense without looking up its ID. If it was the last expense in its category, the category is removed automatically.

**Delete an expense** — send `/delete <id>` to remove a specific entry by its ID (shown in `/list`). Same orphan-category cleanup as `/undo`.

```
/delete 42
```

**Show help** — send `/help` (or `/start`) to see the expense format, examples, and available commands.

**Initialize the database** — send `/migrate` to create the tables and register the bot command menu (admin only).

**View error logs** — send `/logs` to see the last 10 error log entries (admin only).

**Drop pending Telegram updates** — send `/droppending` to flush Telegram's webhook retry queue (admin only). Use this if the bot starts sending repeated messages due to a previous error.

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
  telegram_user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (telegram_user_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT DEFAULT '',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
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
