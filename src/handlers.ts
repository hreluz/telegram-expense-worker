import type { Sql, TelegramBody } from './types';
import { fetchReport, fetchRecent, fetchCategoryTotals, saveExpense, saveLog, deleteExpense, fetchBiggestExpense, deleteLatestExpense, setBudget, removeBudget, fetchBudgets, fetchBudgetForCategory, searchExpenses, renameCategory, fetchTopExpenses, fetchPeriodSummary, categoryExists } from './db';
import { sendTelegramMessage, sendTelegramDocument, answerCallbackQuery, editMessageReplyMarkup } from './telegram';
import { HELP_TEXT, trySend, validateFilter, parseExpense, todayIso, prevMonth } from './handlers/utils';

export { HELP_TEXT, parseExpense } from './handlers/utils';
export * from './handlers/admin';

export async function handleHelp(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	await trySend(sql, token, telegramUserId, HELP_TEXT, 'HTML');
	return Response.json({ ok: true });
}

export async function handleReport(sql: Sql, telegramUserId: number, token: string, view: 'expenses' | 'categories' = 'expenses', filter?: string): Promise<Response> {
	const invalid = await validateFilter(sql, token, telegramUserId, filter);
	if (invalid) return invalid;

	try {
		if (view === 'categories') {
			const rows = await fetchCategoryTotals(sql, telegramUserId, filter);
			const header = 'category,total';
			const csvRows = rows.map((row) => [row.category, row.total].join(','));
			const csv = [header, ...csvRows].join('\n');
			const filename = filter ? `categories-${filter}.csv` : 'categories.csv';
			await sendTelegramDocument(token, telegramUserId, filename, csv);
			return Response.json({ ok: true, csv });
		}

		const rows = await fetchReport(sql, telegramUserId, filter);
		const header = 'date,amount,category,note';
		const csvRows = rows.map((row) => [row.expense_date, row.amount, row.category, row.note ?? ''].join(','));
		const csv = [header, ...csvRows].join('\n');
		const filename = filter ? `expenses-${filter}.csv` : 'expenses.csv';
		await sendTelegramDocument(token, telegramUserId, filename, csv);
		return Response.json({ ok: true, csv });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleList(sql: Sql, telegramUserId: number, token: string, view: 'expenses' | 'categories' = 'expenses', filter?: string): Promise<Response> {
	const invalid = await validateFilter(sql, token, telegramUserId, filter);
	if (invalid) return invalid;

	try {
		if (view === 'categories') {
			const rows = await fetchCategoryTotals(sql, telegramUserId, filter);
			const text = rows.length ? rows.map((r) => `${r.category}  ${r.total}`).join('\n') : 'No expenses yet.';
			await sendTelegramMessage(token, telegramUserId, text);
			return Response.json({ ok: true, rows });
		}

		const rows = await fetchRecent(sql, telegramUserId, filter);
		let text: string;
		if (rows.length) {
			const header = `${'ID'.padEnd(6)}${'Date'.padEnd(12)}${'Amount'.padEnd(10)}${'Category'.padEnd(14)}Note`;
			const lines = rows.map((r) => {
				const id = `#${r.id}`.padEnd(6);
				const date = String(r.expense_date).padEnd(12);
				const amount = String(r.amount).padEnd(10);
				const category = String(r.category).padEnd(14);
				return `${id}${date}${amount}${category}${r.note || ''}`.trimEnd();
			});
			text = [header, ...lines].join('\n');
		} else {
			text = 'No expenses yet.';
		}
		await sendTelegramMessage(token, telegramUserId, text);
		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
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

export async function handleSummary(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	const currentMonth = todayIso().slice(0, 7);
	const monthLabel = new Date(currentMonth + '-02').toLocaleString('en-US', { month: 'long', year: 'numeric' });

	try {
		const thisRows = await fetchCategoryTotals(sql, telegramUserId, currentMonth);

		if (thisRows.length === 0) {
			await trySend(sql, token, telegramUserId, `No expenses recorded for ${monthLabel}.`);
			return Response.json({ ok: true });
		}

		const thisTotal = thisRows.reduce((s, r) => s + Number(r.total), 0);
		const top3 = thisRows.slice(0, 3);

		const lastRows = await fetchCategoryTotals(sql, telegramUserId, prevMonth(currentMonth));
		const lastTotal = lastRows.reduce((s, r) => s + Number(r.total), 0);

		const biggestRows = await fetchBiggestExpense(sql, telegramUserId, currentMonth);
		const biggest = biggestRows[0];

		const budgetRows = await fetchBudgets(sql, telegramUserId);
		const budgetMap = new Map(budgetRows.map((b) => [b.category as string, Number(b.amount)]));

		const overBudget = thisRows.filter((r) => {
			const budget = budgetMap.get(String(r.category));
			return budget !== undefined && Number(r.total) > budget;
		});

		const lines: string[] = [`${monthLabel} Summary`, ''];

		if (overBudget.length > 0) {
			for (const r of overBudget) {
				const budget = budgetMap.get(String(r.category))!;
				const over = (Number(r.total) - budget).toFixed(2);
				lines.push(`Warning: ${r.category} is over budget (${over} over)`);
			}
			lines.push('');
		}

		lines.push(`Total spent:  ${thisTotal.toFixed(2)}`);
		if (lastTotal > 0) {
			const diff = thisTotal - lastTotal;
			const pct = Math.round((diff / lastTotal) * 100);
			const sign = diff >= 0 ? '+' : '';
			const change = pct === 0 ? '(no change)' : `(${sign}${pct}%)`;
			lines.push(`Last month:   ${lastTotal.toFixed(2)}  ${change}`);
		}

		lines.push('');
		lines.push('Top categories:');
		for (const r of top3) {
			const budget = budgetMap.get(String(r.category));
			const actual = Number(r.total);
			if (budget !== undefined) {
				const overBy = actual - budget;
				const budgetPart = overBy > 0 ? ` / ${budget.toFixed(2)}  [over by ${overBy.toFixed(2)}]` : ` / ${budget.toFixed(2)}`;
				lines.push(`  ${String(r.category).padEnd(16)}${actual.toFixed(2)}${budgetPart}`);
			} else {
				lines.push(`  ${String(r.category).padEnd(16)}${actual.toFixed(2)}`);
			}
		}

		if (biggest) {
			lines.push('');
			lines.push('Biggest expense:');
			const notePart = biggest.note ? `  ${biggest.note}` : '';
			lines.push(`  #${biggest.id}  ${Number(biggest.amount).toFixed(2)}  ${biggest.category}${notePart}  (${biggest.expense_date})`);
		}

		await trySend(sql, token, telegramUserId, lines.join('\n'));
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleBudget(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const parts = args.trim().split(/\s+/).filter(Boolean);

	// No args — list all budgets
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
			return Response.json({ ok: false, error: message }, { status: 500 });
		}
	}

	const [category, second] = parts;
	const categoryLower = category.toLowerCase();

	// Remove budget
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
			return Response.json({ ok: false, error: message }, { status: 500 });
		}
	}

	// Set budget
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

export async function handleSearch(sql: Sql, telegramUserId: number, token: string, keyword: string): Promise<Response> {
	if (!keyword) {
		await trySend(sql, token, telegramUserId, 'Use: /search <keyword>');
		return Response.json({ ok: false, error: 'Missing keyword' });
	}

	try {
		const rows = await searchExpenses(sql, telegramUserId, keyword);
		let text: string;
		if (rows.length) {
			const header = `${'ID'.padEnd(6)}${'Date'.padEnd(12)}${'Amount'.padEnd(10)}${'Category'.padEnd(14)}Note`;
			const lines = rows.map((r) => {
				const id = `#${r.id}`.padEnd(6);
				const date = String(r.expense_date).padEnd(12);
				const amount = String(r.amount).padEnd(10);
				const category = String(r.category).padEnd(14);
				return `${id}${date}${amount}${category}${r.note || ''}`.trimEnd();
			});
			text = [header, ...lines].join('\n');
		} else {
			text = `No expenses found for "${keyword}".`;
		}
		await sendTelegramMessage(token, telegramUserId, text);
		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleTop(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const parts = args.split(/\s+/).filter(Boolean);
	let limit = 10;
	let filter: string | undefined;

	if (parts.length > 0) {
		if (/^\d+$/.test(parts[0])) {
			limit = Math.max(1, parseInt(parts[0], 10));
			filter = parts[1];
		} else {
			filter = parts[0];
		}
	}

	const invalid = await validateFilter(sql, token, telegramUserId, filter);
	if (invalid) return invalid;

	try {
		const rows = await fetchTopExpenses(sql, telegramUserId, limit, filter);
		let text: string;
		if (rows.length) {
			const header = `${'ID'.padEnd(6)}${'Date'.padEnd(12)}${'Amount'.padEnd(10)}${'Category'.padEnd(14)}Note`;
			const lines = rows.map((r) => {
				const id = `#${r.id}`.padEnd(6);
				const date = String(r.expense_date).padEnd(12);
				const amount = String(r.amount).padEnd(10);
				const category = String(r.category).padEnd(14);
				return `${id}${date}${amount}${category}${r.note || ''}`.trimEnd();
			});
			text = [header, ...lines].join('\n');
		} else {
			text = 'No expenses found.';
		}
		await trySend(sql, token, telegramUserId, text);
		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

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

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		const savedId = await saveExpense(sql, telegramUserId, expense);
		const lines = [`Saved: ${expense.amount} ${expense.category}`, `Date: ${expense.expenseDate}`];
		if (expense.note) lines.push(`Note: ${expense.note}`);

		// Budget check (best-effort — failure silently skipped)
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

const PERIOD_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function prevPeriod(filter: string): string {
	if (/^\d{4}-\d{2}$/.test(filter)) return prevMonth(filter);
	return String(Number(filter) - 1);
}

function formatPeriodLabel(filter: string): string {
	if (/^\d{4}-\d{2}$/.test(filter)) {
		const [y, m] = filter.split('-');
		const month = new Date(`${y}-${m}-02`).toLocaleString('en-US', { month: 'short' });
		return `${month} ${y}`;
	}
	return filter;
}

export async function handleCompare(sql: Sql, telegramUserId: number, token: string, args: string): Promise<Response> {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const currentMonth = todayIso().slice(0, 7);

	let category: string | undefined;
	let period1: string;
	let period2: string;

	if (tokens.length === 0 || PERIOD_RE.test(tokens[0])) {
		period1 = tokens[0] ?? currentMonth;
		period2 = tokens[1] ?? prevPeriod(period1);
	} else {
		category = tokens[0].toLowerCase();
		period1 = tokens[1] ?? currentMonth;
		period2 = tokens[2] ?? prevPeriod(period1);
	}

	const invalid = await validateFilter(sql, token, telegramUserId, period1) ?? await validateFilter(sql, token, telegramUserId, period2);
	if (invalid) return invalid;

	if (category) {
		const exists = await categoryExists(sql, telegramUserId, category);
		if (!exists) {
			await trySend(sql, token, telegramUserId, `Category '${category}' not found.`);
			return Response.json({ ok: false, error: 'Category not found' });
		}
	}

	try {
		const [s1, s2] = await Promise.all([
			fetchPeriodSummary(sql, telegramUserId, period1, category),
			fetchPeriodSummary(sql, telegramUserId, period2, category),
		]);

		const label1 = formatPeriodLabel(period1);
		const label2 = formatPeriodLabel(period2);
		const title = category ? `${category}: ${label1} vs ${label2}` : `All: ${label1} vs ${label2}`;

		const diff = s2.total - s1.total;
		let changeStr: string;
		if (s1.total === 0) {
			changeStr = s2.total > 0 ? `+${s2.total.toFixed(2)}` : '—';
		} else {
			const sign = diff >= 0 ? '+' : '';
			changeStr = `${sign}${diff.toFixed(2)} (${sign}${Math.round((diff / s1.total) * 100)}%)`;
		}

		const COL = Math.max(label1.length, s1.total.toFixed(2).length, String(s1.count).length, s1.biggest.toFixed(2).length, 1) + 2;
		const ROW = 11;
		const lines = [
			title,
			'',
			`${''.padEnd(ROW)}${label1.padEnd(COL)}${label2}`,
			`${'Total'.padEnd(ROW)}${s1.total.toFixed(2).padEnd(COL)}${s2.total.toFixed(2)}`,
			`${'Count'.padEnd(ROW)}${String(s1.count).padEnd(COL)}${s2.count}`,
			`${'Biggest'.padEnd(ROW)}${s1.biggest.toFixed(2).padEnd(COL)}${s2.biggest.toFixed(2)}`,
			`${'Change'.padEnd(ROW)}${'—'.padEnd(COL)}${changeStr}`,
		];

		await trySend(sql, token, telegramUserId, lines.join('\n'));
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
