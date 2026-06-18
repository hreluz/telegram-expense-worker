import type { Sql } from '../types';
import { fetchCategoryTotals, saveLog, fetchBiggestExpense, fetchBudgets, fetchPeriodSummary, categoryExists } from '../db';
import { trySend, validateFilter, todayIso, prevMonth } from './utils';

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
