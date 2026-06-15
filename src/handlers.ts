import type { Sql, Expense } from "./types";
import { fetchReport, fetchRecent, saveExpense, migrate } from "./db";
import { sendTelegramMessage } from "./telegram";

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

export async function handleReport(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	const rows = await fetchReport(sql, telegramUserId);

	const header = "date,amount,category,note";
	const csvRows = rows.map((row) =>
		[row.created_at, row.amount, row.category, row.note ?? ""].join(",")
	);
	const csv = [header, ...csvRows].join("\n");

	await sendTelegramMessage(token, telegramUserId, csv);

	return Response.json({ ok: true, csv });
}

export async function handleList(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	const rows = await fetchRecent(sql, telegramUserId);

	const text = rows.length
		? rows.map((r) => `${r.amount} ${r.category}${r.note ? ` (${r.note})` : ""}`).join("\n")
		: "No expenses yet.";

	await sendTelegramMessage(token, telegramUserId, text);

	return Response.json({ ok: true, rows });
}

export async function handleMigrate(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	if (!adminIds) {
		await sendTelegramMessage(token, telegramUserId, "ADMIN_IDS is not configured.");
		return Response.json({ ok: false, error: "ADMIN_IDS is not configured" }, { status: 500 });
	}
	const allowed = adminIds.split(",").map((id) => id.trim());
	if (!allowed.includes(String(telegramUserId))) {
		await sendTelegramMessage(token, telegramUserId, "Unauthorized.");
		return Response.json({ ok: false, error: "Unauthorized" }, { status: 403 });
	}
	await migrate(sql);
	await sendTelegramMessage(token, telegramUserId, "Migration complete.");
	return Response.json({ ok: true });
}

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		await saveExpense(sql, telegramUserId, expense);
		await sendTelegramMessage(token, telegramUserId, `Saved: ${expense.amount} ${expense.category}`);
		return Response.json({ ok: true, message: "Saved", expense });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid input";
		await sendTelegramMessage(token, telegramUserId, message);
		return Response.json({ ok: false, error: message }, { status: 400 });
	}
}
