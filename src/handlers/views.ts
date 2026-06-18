import type { Sql } from '../types';
import { fetchReport, fetchRecent, fetchCategoryTotals, saveLog, searchExpenses, fetchTopExpenses } from '../db';
import { sendTelegramMessage, sendTelegramDocument } from '../telegram';
import { HELP_TEXT, trySend, validateFilter } from './utils';

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
