import type { Sql } from '../types';
import { renameCategory, saveLog } from '../db';
import { trySend } from './utils';

export async function handleRename(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const parts = args.trim().split(/\s+/);
	if (parts.length < 2 || !parts[0] || !parts[1]) {
		await trySend(sql, token, telegramUserId, 'Use: /rename <old> <new>');
		return Response.json({ ok: false, error: 'Invalid usage' });
	}

	const oldName = parts[0].toLowerCase();
	const newName = parts[1].toLowerCase();

	if (oldName === newName) {
		await trySend(sql, token, telegramUserId, 'Old and new category names are the same.');
		return Response.json({ ok: false, error: 'Same name' });
	}

	try {
		const result = await renameCategory(sql, telegramUserId, oldName, newName);
		if (!result.found) {
			await trySend(sql, token, telegramUserId, `Category '${oldName}' not found.`);
			return Response.json({ ok: false, error: 'Category not found' });
		}
		await trySend(sql, token, telegramUserId, `Renamed ${oldName} → ${newName}. ${result.count} expense${result.count === 1 ? '' : 's'} updated.`);
		return Response.json({ ok: true, count: result.count });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}
