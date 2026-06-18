import type { Sql, TelegramBody } from '../types';
import { saveExpense, saveLog, deleteExpense, deleteLatestExpense, fetchBudgetForCategory, fetchCategoryTotals, updateExpenseNote } from '../db';
import { answerCallbackQuery, editMessageReplyMarkup } from '../telegram';
import { trySend, parseExpense } from './utils';

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		const savedId = await saveExpense(sql, telegramUserId, expense);
		const lines = [`Saved: ${expense.amount} ${expense.category}`, `Date: ${expense.expenseDate}`];
		if (expense.note) lines.push(`Note: ${expense.note}`);

		try {
			const budgetRows = await fetchBudgetForCategory(sql, telegramUserId, expense.category);
			if (budgetRows.length > 0) {
				const budget = Number(budgetRows[0].amount);
				const currentMonth = expense.expenseDate.slice(0, 7);
				const totals = await fetchCategoryTotals(sql, telegramUserId, currentMonth);
				const row = totals.find((r) => r.category === expense.category);
				if (row && Number(row.total) > budget) {
					const over = (Number(row.total) - budget).toFixed(2);
					lines.push(`Warning: ${expense.category} is over budget (${over} over this month)`);
				}
			}
		} catch {
			// non-critical — skip warning on failure
		}

		const replyMarkup = { inline_keyboard: [[{ text: '🗑 Undo', callback_data: `undo_${savedId}` }]] };
		await trySend(sql, token, telegramUserId, lines.join('\n'), undefined, replyMarkup);
		return Response.json({ ok: true, message: 'Saved', expense });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid input';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleDelete(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const idStr = args.trim();

	if (!idStr) {
		await trySend(sql, token, telegramUserId, 'Use: /delete <id>');
		return Response.json({ ok: false, error: 'Invalid usage' });
	}

	const id = Number(idStr);
	if (!Number.isInteger(id) || id <= 0) {
		await trySend(sql, token, telegramUserId, 'Invalid ID. Use: /delete <id>');
		return Response.json({ ok: false, error: 'Invalid ID' });
	}

	try {
		const result = await deleteExpense(sql, telegramUserId, id);
		if (!result.found) {
			await trySend(sql, token, telegramUserId, 'Expense not found.');
			return Response.json({ ok: false, error: 'Expense not found' });
		}
		await trySend(sql, token, telegramUserId, `Deleted expense #${id}.`);
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleUndo(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	try {
		const result = await deleteLatestExpense(sql, telegramUserId);
		if (!result.found || !result.expense) {
			await trySend(sql, token, telegramUserId, 'No expenses to undo.');
			return Response.json({ ok: true });
		}
		const { amount, category, expense_date } = result.expense;
		await trySend(sql, token, telegramUserId, `Undone: ${Number(amount).toFixed(2)} ${category} (${expense_date}).`);
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleNote(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const parts = args.trim().split(/\s+/);
	const idStr = parts[0];

	if (!idStr) {
		await trySend(sql, token, telegramUserId, 'Use: /note <id> [text]');
		return Response.json({ ok: false, error: 'Invalid usage' });
	}

	const id = Number(idStr);
	if (!Number.isInteger(id) || id <= 0) {
		await trySend(sql, token, telegramUserId, 'Invalid ID. Use: /note <id> [text]');
		return Response.json({ ok: false, error: 'Invalid ID' });
	}

	const note = parts.slice(1).join(' ');

	try {
		const found = await updateExpenseNote(sql, telegramUserId, id, note);
		if (!found) {
			await trySend(sql, token, telegramUserId, `Expense #${id} not found.`);
			return Response.json({ ok: false, error: 'Expense not found' });
		}
		const msg = note ? `Note updated for expense #${id}: ${note}` : `Note cleared for expense #${id}.`;
		await trySend(sql, token, telegramUserId, msg);
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleCallbackQuery(sql: Sql, callbackQuery: NonNullable<TelegramBody['callback_query']>, token: string): Promise<Response> {
	const { id: callbackQueryId, from, message, data } = callbackQuery;
	const telegramUserId = from.id;
	const chatId = message?.chat?.id ?? telegramUserId;
	const messageId = message?.message_id;

	if (data?.startsWith('undo_')) {
		const expenseId = parseInt(data.slice(5), 10);
		try {
			const result = await deleteExpense(sql, telegramUserId, expenseId);
			const msg = result.found ? `Expense #${expenseId} deleted.` : 'Expense not found.';
			await trySend(sql, token, chatId, msg);
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Unknown error';
			await saveLog(sql, telegramUserId, msg);
			await trySend(sql, token, chatId, msg);
		}
	}

	// Always answer and clean up buttons (best-effort)
	try {
		await answerCallbackQuery(token, callbackQueryId);
		if (messageId) await editMessageReplyMarkup(token, chatId, messageId, {});
	} catch {
		// non-critical
	}

	return Response.json({ ok: true });
}
