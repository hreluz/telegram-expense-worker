import type { Sql, Expense } from "./types";

export async function migrate(sql: Sql) {
	await sql`
		CREATE TABLE IF NOT EXISTS expenses (
			id SERIAL PRIMARY KEY,
			telegram_user_id BIGINT NOT NULL,
			amount NUMERIC(10, 2) NOT NULL,
			category TEXT NOT NULL,
			note TEXT DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`;
}

export async function fetchReport(sql: Sql, telegramUserId: number) {
	return sql`
		SELECT created_at, amount, category, note
		FROM expenses
		WHERE telegram_user_id = ${telegramUserId}
		ORDER BY created_at DESC
	`;
}

export async function fetchRecent(sql: Sql, telegramUserId: number) {
	return sql`
		SELECT amount, category, note, created_at
		FROM expenses
		WHERE telegram_user_id = ${telegramUserId}
		ORDER BY created_at DESC
		LIMIT 10
	`;
}

export async function saveExpense(sql: Sql, telegramUserId: number, expense: Expense) {
	await sql`
		INSERT INTO expenses (telegram_user_id, amount, category, note)
		VALUES (${telegramUserId}, ${expense.amount}, ${expense.category}, ${expense.note})
	`;
}
