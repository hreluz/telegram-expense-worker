import type { Sql, Expense } from "./types";
import { fetchReport, fetchRecent, fetchCategoryTotals, saveExpense, migrate, saveLog, fetchLogs, deleteExpense, fetchBiggestExpense } from "./db";
import { sendTelegramMessage, sendTelegramDocument, dropPendingUpdates, setTelegramCommands } from "./telegram";

export const HELP_TEXT = `Expense Tracker Bot

Log an expense:
  300 gym
  45.50 groceries weekly shopping
  300 gym @2026-06-10
  300 gym @2026-06-10 bought shoes

Format: <amount> <category> [@YYYY-MM-DD] [note]

Commands:
  /list                        — last 10 expenses (with IDs)
  /list 2026-05                — filter by year, month, or day
  /list categories             — totals per category (all time)
  /list categories 2026-05     — totals per category for a period
  /report                      — full history as CSV file
  /report 2026-05              — filtered CSV for a period
  /report categories           — category totals as CSV
  /report categories 2026-05   — category totals CSV for a period
  /delete <id>                 — delete an expense by ID
  /summary                     — spending snapshot for the current month
  /help                        — show this message

Date filter format: YYYY, YYYY-MM, or YYYY-MM-DD`;

async function trySend(sql: Sql, token: string, telegramUserId: number, text: string) {
	try {
		await sendTelegramMessage(token, telegramUserId, text);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to send Telegram message";
		await saveLog(sql, telegramUserId, message);
	}
}

async function requireAdmin(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response | null> {
	if (!adminIds) {
		await trySend(sql, token, telegramUserId, "ADMIN_IDS is not configured.");
		return Response.json({ ok: false, error: "ADMIN_IDS is not configured" }, { status: 500 });
	}
	const allowed = adminIds.split(",").map((id) => id.trim());
	if (!allowed.includes(String(telegramUserId))) {
		await trySend(sql, token, telegramUserId, "Unauthorized.");
		return Response.json({ ok: false, error: "Unauthorized" });
	}
	return null;
}

const DATE_TOKEN_RE = /^@(\d{4}-\d{2}-\d{2})$/;

function isValidDate(s: string): boolean {
	const d = new Date(s);
	return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export function parseExpense(text: string): Expense {
	const parts = text.trim().split(/\s+/);

	const FORMAT_HINT = `Format: <amount> <category> [@YYYY-MM-DD] [note]

Examples:
  300 gym
  45.50 groceries weekly shopping
  300 gym @2026-06-10
  300 gym @2026-06-10 bought shoes`;

	if (parts.length < 2) {
		throw new Error(FORMAT_HINT);
	}

	const amount = Number(parts[0]);
	const category = parts[1].toLowerCase();

	if (Number.isNaN(amount) || amount <= 0) {
		throw new Error(FORMAT_HINT);
	}

	const trailing = parts.slice(2);
	let expenseDate: string | undefined;
	const noteTokens: string[] = [];

	for (const token of trailing) {
		const match = DATE_TOKEN_RE.exec(token);
		if (match && expenseDate === undefined) {
			const candidate = match[1];
			if (!isValidDate(candidate)) {
				throw new Error("Invalid date. Use @YYYY-MM-DD format");
			}
			expenseDate = candidate;
		} else {
			noteTokens.push(token);
		}
	}

	return { amount, category, note: noteTokens.join(" "), expenseDate: expenseDate ?? todayIso() };
}

const FILTER_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

async function validateFilter(sql: Sql, token: string, telegramUserId: number, filter: string | undefined): Promise<Response | null> {
	if (filter && !FILTER_RE.test(filter)) {
		await trySend(sql, token, telegramUserId, "Invalid date filter. Use YYYY, YYYY-MM, or YYYY-MM-DD");
		return Response.json({ ok: false, error: "Invalid filter" });
	}
	return null;
}

export async function handleReport(sql: Sql, telegramUserId: number, token: string, view: 'expenses' | 'categories' = 'expenses', filter?: string): Promise<Response> {
	const invalid = await validateFilter(sql, token, telegramUserId, filter);
	if (invalid) return invalid;

	try {
		if (view === 'categories') {
			const rows = await fetchCategoryTotals(sql, telegramUserId, filter);
			const header = "category,total";
			const csvRows = rows.map((row) => [row.category, row.total].join(","));
			const csv = [header, ...csvRows].join("\n");
			const filename = filter ? `categories-${filter}.csv` : 'categories.csv';
			await sendTelegramDocument(token, telegramUserId, filename, csv);
			return Response.json({ ok: true, csv });
		}

		const rows = await fetchReport(sql, telegramUserId, filter);
		const header = "date,amount,category,note";
		const csvRows = rows.map((row) =>
			[row.expense_date, row.amount, row.category, row.note ?? ""].join(",")
		);
		const csv = [header, ...csvRows].join("\n");
		const filename = filter ? `expenses-${filter}.csv` : 'expenses.csv';
		await sendTelegramDocument(token, telegramUserId, filename, csv);

		return Response.json({ ok: true, csv });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Something went wrong.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleList(sql: Sql, telegramUserId: number, token: string, view: 'expenses' | 'categories' = 'expenses', filter?: string): Promise<Response> {
	const invalid = await validateFilter(sql, token, telegramUserId, filter);
	if (invalid) return invalid;

	try {
		if (view === 'categories') {
			const rows = await fetchCategoryTotals(sql, telegramUserId, filter);
			const text = rows.length
				? rows.map((r) => `${r.category}  ${r.total}`).join("\n")
				: "No expenses yet.";
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
			text = [header, ...lines].join("\n");
		} else {
			text = "No expenses yet.";
		}
		await sendTelegramMessage(token, telegramUserId, text);

		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Something went wrong.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleHelp(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	await trySend(sql, token, telegramUserId, HELP_TEXT);
	return Response.json({ ok: true });
}

export async function handleMigrate(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		await migrate(sql);
		await setTelegramCommands(token);
		await trySend(sql, token, telegramUserId, "Migration complete.");
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Migration failed.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleLogs(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		const rows = await fetchLogs(sql, telegramUserId);

		const text = rows.length
			? rows.map((r) => `[${r.created_at}] ${r.message}`).join("\n")
			: "No logs.";

		await trySend(sql, token, telegramUserId, text);

		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await trySend(sql, token, telegramUserId, "Something went wrong.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleDropPending(sql: Sql, telegramUserId: number, token: string, webhookUrl: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		await dropPendingUpdates(token, webhookUrl);
		await trySend(sql, token, telegramUserId, "Pending updates dropped.");
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Failed to drop pending updates.");
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

function prevMonth(m: string): string {
	const [y, mo] = m.split('-').map(Number);
	return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
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
		return Response.json({ ok: true, message: "Saved", expense });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid input";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}
