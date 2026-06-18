import type { Sql } from '../types';
import { migrate, saveLog, fetchLogs } from '../db';
import { dropPendingUpdates, setTelegramCommands } from '../telegram';
import { trySend } from './utils';

async function requireAdmin(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response | null> {
	if (!adminIds) {
		await trySend(sql, token, telegramUserId, 'ADMIN_IDS is not configured.');
		return Response.json({ ok: false, error: 'ADMIN_IDS is not configured' }, { status: 500 });
	}
	const allowed = adminIds.split(',').map((id) => id.trim());
	if (!allowed.includes(String(telegramUserId))) {
		await trySend(sql, token, telegramUserId, 'Unauthorized.');
		return Response.json({ ok: false, error: 'Unauthorized' });
	}
	return null;
}

export async function handleMigrate(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		await migrate(sql);
		await setTelegramCommands(token);
		await trySend(sql, token, telegramUserId, 'Migration complete.');
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, 'Migration failed.');
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleLogs(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		const rows = await fetchLogs(sql, telegramUserId);
		const text = rows.length
			? rows.map((r) => `[${r.created_at}] ${r.message}`).join('\n')
			: 'No logs.';
		await trySend(sql, token, telegramUserId, text);
		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleDropPending(sql: Sql, telegramUserId: number, token: string, webhookUrl: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		await dropPendingUpdates(token, webhookUrl);
		await trySend(sql, token, telegramUserId, 'Pending updates dropped.');
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, 'Failed to drop pending updates.');
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}
