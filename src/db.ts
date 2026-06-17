import type { Sql, Expense } from "./types";

export async function migrate(sql: Sql) {
	await sql`
		CREATE TABLE IF NOT EXISTS categories (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL UNIQUE
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

export async function fetchReport(sql: Sql, telegramUserId: number, filter?: string) {
	if (filter) {
		const pattern = `${filter}%`;
		return sql`
			SELECT e.expense_date::text AS expense_date, e.amount, c.name AS category, e.note
			FROM expenses e
			JOIN categories c ON c.id = e.category_id
			WHERE e.telegram_user_id = ${telegramUserId}
				AND e.expense_date::text LIKE ${pattern}
			ORDER BY e.expense_date DESC, e.created_at DESC
		`;
	}
	return sql`
		SELECT e.expense_date::text AS expense_date, e.amount, c.name AS category, e.note
		FROM expenses e
		JOIN categories c ON c.id = e.category_id
		WHERE e.telegram_user_id = ${telegramUserId}
		ORDER BY e.expense_date DESC, e.created_at DESC
	`;
}

export async function fetchRecent(sql: Sql, telegramUserId: number, filter?: string) {
	if (filter) {
		const pattern = `${filter}%`;
		return sql`
			SELECT e.amount, c.name AS category, e.note, e.expense_date::text AS expense_date, e.created_at
			FROM expenses e
			JOIN categories c ON c.id = e.category_id
			WHERE e.telegram_user_id = ${telegramUserId}
				AND e.expense_date::text LIKE ${pattern}
			ORDER BY e.expense_date DESC, e.created_at DESC
		`;
	}
	return sql`
		SELECT e.amount, c.name AS category, e.note, e.expense_date::text AS expense_date, e.created_at
		FROM expenses e
		JOIN categories c ON c.id = e.category_id
		WHERE e.telegram_user_id = ${telegramUserId}
		ORDER BY e.expense_date DESC, e.created_at DESC
		LIMIT 10
	`;
}

async function upsertCategory(sql: Sql, name: string): Promise<number> {
	const rows = await sql`
		INSERT INTO categories (name) VALUES (${name})
		ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`;
	return rows[0].id as number;
}

export async function saveExpense(sql: Sql, telegramUserId: number, expense: Expense) {
	const categoryId = await upsertCategory(sql, expense.category);
	await sql`
		INSERT INTO expenses (telegram_user_id, amount, category_id, note, expense_date)
		VALUES (${telegramUserId}, ${expense.amount}, ${categoryId}, ${expense.note}, ${expense.expenseDate})
	`;
}
