import type { Sql, Expense } from '../types';
import { sendTelegramMessage } from '../telegram';
import { saveLog } from '../db';

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
  /undo                        — delete the most recently added expense
  /delete <id>                 — delete an expense by ID
  /summary                     — spending snapshot for the current month
  /help                        — show this message

Date filter format: YYYY, YYYY-MM, or YYYY-MM-DD`;

export async function trySend(sql: Sql, token: string, telegramUserId: number, text: string) {
	try {
		await sendTelegramMessage(token, telegramUserId, text);
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
