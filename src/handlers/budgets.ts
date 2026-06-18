import type { Sql } from '../types';
import { setBudget, removeBudget, fetchBudgets, saveLog } from '../db';
import { trySend } from './utils';

export async function handleBudget(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const parts = args.trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		try {
			const rows = await fetchBudgets(sql, telegramUserId);
			if (rows.length === 0) {
				await trySend(sql, token, telegramUserId, 'No budgets set.');
				return Response.json({ ok: true });
			}
			const lines = rows.map((r) => `  ${String(r.category).padEnd(16)}${Number(r.amount).toFixed(2)}`);
			await trySend(sql, token, telegramUserId, `Budgets:\n${lines.join('\n')}`);
			return Response.json({ ok: true, rows });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			await saveLog(sql, telegramUserId, message);
			await trySend(sql, token, telegramUserId, 'Something went wrong.');
			return Response.json({ ok: false, error: message });
		}
	}

	const [category, second] = parts;
	const categoryLower = category.toLowerCase();

	if (second === 'off') {
		try {
			const removed = await removeBudget(sql, telegramUserId, categoryLower);
			if (!removed) {
				await trySend(sql, token, telegramUserId, `No budget set for ${categoryLower}.`);
				return Response.json({ ok: false, error: 'Budget not found' });
			}
			await trySend(sql, token, telegramUserId, `Budget removed: ${categoryLower}`);
			return Response.json({ ok: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			await saveLog(sql, telegramUserId, message);
			await trySend(sql, token, telegramUserId, 'Something went wrong.');
			return Response.json({ ok: false, error: message });
		}
	}

	const amount = Number(second);
	if (!second || Number.isNaN(amount) || amount <= 0) {
		await trySend(sql, token, telegramUserId, 'Use: /budget <category> <amount> or /budget <category> off');
		return Response.json({ ok: false, error: 'Invalid usage' });
	}

	try {
		await setBudget(sql, telegramUserId, categoryLower, amount);
		await trySend(sql, token, telegramUserId, `Budget set: ${categoryLower}  ${amount.toFixed(2)}/month`);
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}
