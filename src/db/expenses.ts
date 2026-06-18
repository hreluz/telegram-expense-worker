import type { Sql, Expense } from '../types';

async function upsertCategory(sql: Sql, telegramUserId: number, name: string): Promise<number> {
	const rows = await sql`
		INSERT INTO categories (telegram_user_id, name) VALUES (${telegramUserId}, ${name})
		ON CONFLICT (telegram_user_id, name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`;
	return rows[0].id as number;
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
			SELECT e.id, e.amount, c.name AS category, e.note, e.expense_date::text AS expense_date, e.created_at
			FROM expenses e
			JOIN categories c ON c.id = e.category_id
			WHERE e.telegram_user_id = ${telegramUserId}
				AND e.expense_date::text LIKE ${pattern}
			ORDER BY e.expense_date DESC, e.created_at DESC
		`;
	}
	return sql`
		SELECT e.id, e.amount, c.name AS category, e.note, e.expense_date::text AS expense_date, e.created_at
		FROM expenses e
		JOIN categories c ON c.id = e.category_id
		WHERE e.telegram_user_id = ${telegramUserId}
		ORDER BY e.expense_date DESC, e.created_at DESC
		LIMIT 10
	`;
}

export async function saveExpense(sql: Sql, telegramUserId: number, expense: Expense) {
	const categoryId = await upsertCategory(sql, telegramUserId, expense.category);
	await sql`
		INSERT INTO expenses (telegram_user_id, amount, category_id, note, expense_date)
		VALUES (${telegramUserId}, ${expense.amount}, ${categoryId}, ${expense.note}, ${expense.expenseDate})
	`;
}

export async function fetchBiggestExpense(sql: Sql, telegramUserId: number, filter: string) {
	const pattern = `${filter}%`;
	return sql`
		SELECT e.id, e.amount, c.name AS category, e.note, e.expense_date::text AS expense_date
		FROM expenses e
		JOIN categories c ON c.id = e.category_id
		WHERE e.telegram_user_id = ${telegramUserId}
			AND e.expense_date::text LIKE ${pattern}
		ORDER BY e.amount DESC
		LIMIT 1
	`;
}

export async function deleteExpense(sql: Sql, telegramUserId: number, id: number): Promise<{ found: boolean; categoryDeleted: boolean }> {
	const deleted = await sql`
		DELETE FROM expenses
		WHERE id = ${id} AND telegram_user_id = ${telegramUserId}
		RETURNING category_id
	`;

	if (deleted.length === 0) {
		return { found: false, categoryDeleted: false };
	}

	const categoryId = deleted[0].category_id as number;
	const remaining = await sql`
		SELECT COUNT(*)::int AS count FROM expenses WHERE category_id = ${categoryId}
	`;

	if ((remaining[0].count as number) === 0) {
		await sql`DELETE FROM categories WHERE id = ${categoryId}`;
		return { found: true, categoryDeleted: true };
	}

	return { found: true, categoryDeleted: false };
}

export async function deleteLatestExpense(sql: Sql, telegramUserId: number): Promise<{
	found: boolean;
	categoryDeleted: boolean;
	expense?: { id: number; amount: number; category: string; expense_date: string };
}> {
	const deleted = await sql`
		DELETE FROM expenses
		WHERE id = (
			SELECT id FROM expenses
			WHERE telegram_user_id = ${telegramUserId}
			ORDER BY created_at DESC
			LIMIT 1
		)
		RETURNING id, amount, category_id, expense_date::text AS expense_date
	`;

	if (deleted.length === 0) {
		return { found: false, categoryDeleted: false };
	}

	const { id, amount, category_id: categoryId, expense_date } = deleted[0] as { id: number; amount: number; category_id: number; expense_date: string };

	const catRows = await sql`SELECT name FROM categories WHERE id = ${categoryId}`;
	const category = catRows[0].name as string;

	const remaining = await sql`SELECT COUNT(*)::int AS count FROM expenses WHERE category_id = ${categoryId}`;
	if ((remaining[0].count as number) === 0) {
		await sql`DELETE FROM categories WHERE id = ${categoryId}`;
		return { found: true, categoryDeleted: true, expense: { id, amount, category, expense_date } };
	}

	return { found: true, categoryDeleted: false, expense: { id, amount, category, expense_date } };
}
