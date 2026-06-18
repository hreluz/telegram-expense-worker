import type { Sql } from '../types';

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
