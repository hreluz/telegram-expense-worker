import type { Sql, Expense } from '../types';
import { sendTelegramMessage } from '../telegram';
import { saveLog } from '../db';

export const HELP_TEXT = `<b>Expense Tracker Bot</b>

Send a message to log an expense:
🏋️ <code>300 gym</code>
🛒 <code>45.50 groceries weekly shopping</code>
🗓 <code>300 gym @2026-06-10</code>
📝 <code>300 gym @2026-06-10 bought shoes</code>
Format: <code>&lt;amount&gt; &lt;category&gt; [@YYYY-MM-DD] [note]</code>

📋 <b>View</b>
<code>/list</code> — last 10 expenses
<code>/list 2026-05</code> — filter by year, month, or day
<code>/search gym</code> — find expenses by category or note
<code>/report</code> — export full history as CSV
<code>/summary</code> — monthly spending snapshot

🗂 <b>Manage</b>
<code>/undo</code> — delete last expense
<code>/delete &lt;id&gt;</code> — delete by ID
<code>/rename coffee cafe</code> — merge a category into another

💰 <b>Budgets</b>
<code>/budget gym 500</code> — set monthly limit
<code>/budget gym off</code> — remove limit
<code>/budget</code> — list all budgets

💡 Add <code>categories</code> after <code>/list</code> or <code>/report</code> for totals
📅 Date filter: YYYY, YYYY-MM, or YYYY-MM-DD`;

export async function trySend(sql: Sql, token: string, telegramUserId: number, text: string, parseMode?: string, replyMarkup?: Record<string, unknown>) {
	try {
		if (replyMarkup) {
			await sendTelegramMessage(token, telegramUserId, text, parseMode, replyMarkup);
		} else if (parseMode) {
			await sendTelegramMessage(token, telegramUserId, text, parseMode);
		} else {
			await sendTelegramMessage(token, telegramUserId, text);
		}
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
