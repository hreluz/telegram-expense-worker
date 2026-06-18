import type { Sql } from '../types';

export async function migrate(sql: Sql) {
	await sql`
		CREATE TABLE IF NOT EXISTS categories (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT NOT NULL,
			name TEXT NOT NULL,
			UNIQUE (telegram_user_id, name)
		)
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS expenses (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT NOT NULL,
			amount NUMERIC(10, 2) NOT NULL,
			category_id INTEGER NOT NULL REFERENCES categories(id),
			note TEXT DEFAULT '',
			expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS logs (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT,
			message TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS budgets (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT NOT NULL,
			category TEXT NOT NULL,
			amount NUMERIC(10, 2) NOT NULL,
			UNIQUE (telegram_user_id, category)
		)
	`;
	await sql`
		CREATE TABLE IF NOT EXISTS user_settings (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT NOT NULL,
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			UNIQUE (telegram_user_id, key)
		)
	`;
}

export async function saveLog(sql: Sql, telegramUserId: number, message: string) {
	await sql`
		INSERT INTO logs (telegram_user_id, message)
		VALUES (${telegramUserId}, ${message})
	`;
}

export async function fetchLogs(sql: Sql, telegramUserId: number) {
	return sql`
		SELECT message, created_at
		FROM logs
		WHERE telegram_user_id = ${telegramUserId}
		ORDER BY created_at DESC
		LIMIT 10
	`;
}
