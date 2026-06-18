import type { Sql } from '../types';

export async function setUserSetting(sql: Sql, telegramUserId: number, key: string, value: string): Promise<void> {
	await sql`
		INSERT INTO user_settings (telegram_user_id, key, value)
		VALUES (${telegramUserId}, ${key}, ${value})
		ON CONFLICT (telegram_user_id, key) DO UPDATE SET value = EXCLUDED.value
	`;
}

export async function getUserSetting(sql: Sql, telegramUserId: number, key: string): Promise<string | null> {
	const rows = await sql`SELECT value FROM user_settings WHERE telegram_user_id = ${telegramUserId} AND key = ${key} LIMIT 1`;
	return rows.length > 0 ? (rows[0].value as string) : null;
}

export async function fetchAllSettings(sql: Sql, telegramUserId: number) {
	return sql`SELECT key, value FROM user_settings WHERE telegram_user_id = ${telegramUserId} ORDER BY key`;
}
