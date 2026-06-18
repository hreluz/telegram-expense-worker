import type { Sql } from './types';
import { fetchReport, fetchRecent, fetchCategoryTotals, saveExpense, saveLog, deleteExpense, fetchBiggestExpense, deleteLatestExpense } from './db';
import { sendTelegramMessage, sendTelegramDocument } from './telegram';
import { HELP_TEXT, trySend, validateFilter, parseExpense, todayIso, prevMonth } from './handlers/utils';

export { HELP_TEXT, parseExpense } from './handlers/utils';
export * from './handlers/admin';

export async function handleHelp(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	await trySend(sql, token, telegramUserId, HELP_TEXT);
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
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
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
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
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
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
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
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
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

		const lines: string[] = [`${monthLabel} Summary`, ''];

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
			lines.push(`  ${String(r.category).padEnd(16)}${Number(r.total).toFixed(2)}`);
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
		await trySend(sql, token, telegramUserId, 'Something went wrong.');
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		await saveExpense(sql, telegramUserId, expense);
		const lines = [`Saved: ${expense.amount} ${expense.category}`, `Date: ${expense.expenseDate}`];
		if (expense.note) lines.push(`Note: ${expense.note}`);
		await trySend(sql, token, telegramUserId, lines.join('\n'));
		return Response.json({ ok: true, message: 'Saved', expense });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid input';
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}
