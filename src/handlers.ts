import type { Sql, Expense } from "./types";
import { fetchReport, fetchRecent, saveExpense } from "./db";

export function parseExpense(text: string): Expense {
	const parts = text.trim().split(/\s+/);

	if (parts.length < 2) {
		throw new Error("Use format: 300 gym");
	}

	const amount = Number(parts[0]);
	const category = parts[1];
	const note = parts.slice(2).join(" ");

	if (Number.isNaN(amount) || amount <= 0) {
		throw new Error("Amount must be a valid number");
	}

	return { amount, category, note };
}

export async function handleReport(sql: Sql, telegramUserId: number): Promise<Response> {
	const rows = await fetchReport(sql, telegramUserId);

	const header = "date,amount,category,note";
	const csvRows = rows.map((row) =>
		[row.created_at, row.amount, row.category, row.note ?? ""].join(",")
	);
	const csv = [header, ...csvRows].join("\n");

	return Response.json({ ok: true, csv });
}

export async function handleList(sql: Sql, telegramUserId: number): Promise<Response> {
	const rows = await fetchRecent(sql, telegramUserId);
	return Response.json({ ok: true, rows });
}

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		await saveExpense(sql, telegramUserId, expense);
		return Response.json({ ok: true, message: "Saved", expense });
	} catch (error) {
		return Response.json(
			{ ok: false, error: error instanceof Error ? error.message : "Invalid input" },
			{ status: 400 }
		);
	}
}
