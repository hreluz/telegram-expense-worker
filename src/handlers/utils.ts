import type { Sql, Expense } from '../types';
import { sendTelegramMessage } from '../telegram';
import { saveLog } from '../db';

export const HELP_TEXT = `<b>Expense Tracker Bot</b>

Send a message to log an expense:
<pre>300 gym
45.50 groceries weekly shopping
300 gym @2026-06-10
300 gym @2026-06-10 bought shoes</pre>
Format: &lt;amount&gt; &lt;category&gt; [@YYYY-MM-DD] [note]

<b>View</b>
/list — last 10 expenses
/list 2026-05 — filter by year, month, or day
/report — export full history as CSV
/summary — monthly spending snapshot

<b>Manage</b>
/undo — delete last expense
/delete &lt;id&gt; — delete by ID

<b>Budgets</b>
/budget gym 500 — set monthly limit
/budget gym off — remove limit
/budget — list all budgets

Add <code>categories</code> after /list or /report for category totals.
Date filter format: YYYY, YYYY-MM, or YYYY-MM-DD`;

export async function trySend(sql: Sql, token: string, telegramUserId: number, text: string, parseMode?: string) {
	try {
		await (parseMode ? sendTelegramMessage(token, telegramUserId, text, parseMode) : sendTelegramMessage(token, telegramUserId, text));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to send Telegram message';
		await saveLog(sql, telegramUserId, message);
	}
}

const DATE_TOKEN_RE = /^@(\d{4}-\d{2}-\d{2})$/;

function isValidDate(s: string): boolean {
	const d = new Date(s);
	return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function todayIso(): string {
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
				throw new Error('Invalid date. Use @YYYY-MM-DD format');
			}
			expenseDate = candidate;
		} else {
			noteTokens.push(token);
		}
	}

	return { amount, category, note: noteTokens.join(' '), expenseDate: expenseDate ?? todayIso() };
}

const FILTER_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export async function validateFilter(sql: Sql, token: string, telegramUserId: number, filter: string | undefined): Promise<Response | null> {
	if (filter && !FILTER_RE.test(filter)) {
		await trySend(sql, token, telegramUserId, 'Invalid date filter. Use YYYY, YYYY-MM, or YYYY-MM-DD');
		return Response.json({ ok: false, error: 'Invalid filter' });
	}
	return null;
}

export function prevMonth(m: string): string {
	const [y, mo] = m.split('-').map(Number);
	return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}
