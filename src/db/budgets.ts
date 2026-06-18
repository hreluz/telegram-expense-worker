import type { Sql } from '../types';

export async function setBudget(sql: Sql, telegramUserId: number, category: string, amount: number) {
	await sql`
		INSERT INTO budgets (telegram_user_id, category, amount)
		VALUES (${telegramUserId}, ${category}, ${amount})
		ON CONFLICT (telegram_user_id, category) DO UPDATE SET amount = EXCLUDED.amount
	`;
}

export async function removeBudget(sql: Sql, telegramUserId: number, category: string): Promise<boolean> {
	const deleted = await sql`
		DELETE FROM budgets
		WHERE telegram_user_id = ${telegramUserId} AND category = ${category}
		RETURNING id
	`;
	return deleted.length > 0;
}

export async function fetchBudgets(sql: Sql, telegramUserId: number) {
	return sql`
		SELECT category, amount
		FROM budgets
		WHERE telegram_user_id = ${telegramUserId}
		ORDER BY category
	`;
}

export async function fetchBudgetForCategory(sql: Sql, telegramUserId: number, category: string) {
	return sql`
		SELECT amount
		FROM budgets
		WHERE telegram_user_id = ${telegramUserId} AND category = ${category}
	`;
}
