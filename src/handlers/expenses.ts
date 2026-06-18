import type { Sql, TelegramBody } from '../types';
import { saveExpense, saveLog, deleteExpense, deleteLatestExpense, fetchBudgetForCategory, fetchCategoryTotals, updateExpenseNote, categoryExists, fetchAllCategories, getUserSetting } from '../db';
import { answerCallbackQuery, editMessageReplyMarkup, sendTelegramMessage } from '../telegram';
import { trySend, parseExpense } from './utils';
import { handleSettingCallback } from './settings';

function buildCategoryPickerKeyboard(existingCategories: string[], typed: string): Record<string, unknown> {
	const limited = existingCategories.slice(0, 10);
	const rows: { text: string; callback_data: string }[][] = [];
	for (let i = 0; i < limited.length; i += 3) {
		rows.push(limited.slice(i, i + 3).map((cat) => ({ text: cat, callback_data: `catpick_${cat}` })));
	}
	rows.push([{ text: `Keep '${typed}'`, callback_data: `catpick_${typed}` }]);
	return { inline_keyboard: rows };
}

async function saveParsedExpense(sql: Sql, token: string, telegramUserId: number, chatId: number, text: string, overrideCategory?: string): Promise<void> {
	const expense = parseExpense(text);
	if (overrideCategory) expense.category = overrideCategory;
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
	await trySend(sql, token, chatId, lines.join('\n'), undefined, replyMarkup);
}

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string, messageId?: number): Promise<Response> {
	try {
		const expense = parseExpense(text);
		const exists = await categoryExists(sql, telegramUserId, expense.category);

		if (!exists) {
			const pickerSetting = await getUserSetting(sql, telegramUserId, 'category_picker');
			if (pickerSetting !== 'off') {
				const categories = await fetchAllCategories(sql, telegramUserId);
				if (categories.length > 0) {
					const keyboard = buildCategoryPickerKeyboard(categories, expense.category);
					await sendTelegramMessage(token, telegramUserId, `Category '${expense.category}' is new. Did you mean one of these?`, undefined, keyboard, messageId);
					return Response.json({ ok: true, message: 'Category picker sent' });
				}
			}
		}

		await saveParsedExpense(sql, token, telegramUserId, telegramUserId, text);
		return Response.json({ ok: true, message: 'Saved' });
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
	} else if (data?.startsWith('catpick_')) {
		const chosenCategory = data.slice(8);
		const originalText = message?.reply_to_message?.text;
		if (!originalText) {
			await trySend(sql, token, chatId, "Could not retrieve original message. Please re-send your expense.");
		} else {
			try {
				await saveParsedExpense(sql, token, telegramUserId, chatId, originalText, chosenCategory);
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Invalid input';
				await saveLog(sql, telegramUserId, msg);
				await trySend(sql, token, chatId, msg);
			}
		}
	} else if (data?.startsWith('setting|')) {
		await handleSettingCallback(sql, token, telegramUserId, chatId, messageId ?? 0, callbackQueryId, data);
		return Response.json({ ok: true });
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
