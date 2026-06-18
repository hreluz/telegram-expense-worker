import type { Sql } from '../types';

export async function renameCategory(sql: Sql, telegramUserId: number, oldName: string, newName: string): Promise<{ found: boolean; count: number }> {
	const oldRows = await sql`SELECT id FROM categories WHERE telegram_user_id = ${telegramUserId} AND name = ${oldName}`;
	if (oldRows.length === 0) return { found: false, count: 0 };
	const oldId = oldRows[0].id as number;

	const newRows = await sql`
		INSERT INTO categories (telegram_user_id, name) VALUES (${telegramUserId}, ${newName})
		ON CONFLICT (telegram_user_id, name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id
	`;
	const newId = newRows[0].id as number;

	const updated = await sql`UPDATE expenses SET category_id = ${newId} WHERE category_id = ${oldId} RETURNING id`;
	await sql`DELETE FROM categories WHERE id = ${oldId}`;

	return { found: true, count: updated.length };
}

export async function categoryExists(sql: Sql, telegramUserId: number, name: string): Promise<boolean> {
	const rows = await sql`SELECT 1 FROM categories WHERE telegram_user_id = ${telegramUserId} AND name = ${name} LIMIT 1`;
	return rows.length > 0;
}

export async function fetchCategoryTotals(sql: Sql, telegramUserId: number, filter?: string) {
	if (filter) {
		const pattern = `${filter}%`;
		return sql`
			SELECT c.name AS category, SUM(e.amount)::numeric(10,2) AS total
			FROM expenses e
			JOIN categories c ON c.id = e.category_id
			WHERE e.telegram_user_id = ${telegramUserId}
				AND e.expense_date::text LIKE ${pattern}
			GROUP BY c.name
			ORDER BY total DESC
		`;
	}
	return sql`
		SELECT c.name AS category, SUM(e.amount)::numeric(10,2) AS total
		FROM expenses e
		JOIN categories c ON c.id = e.category_id
		WHERE e.telegram_user_id = ${telegramUserId}
		GROUP BY c.name
		ORDER BY total DESC
	`;
}
