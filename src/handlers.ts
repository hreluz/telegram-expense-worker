import type { Sql, Expense } from "./types";
import { fetchReport, fetchRecent, saveExpense, migrate, saveLog, fetchLogs } from "./db";
import { sendTelegramMessage } from "./telegram";

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
		return Response.json({ ok: false, error: "Unauthorized" }, { status: 403 });
	}
	return null;
}

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
	try {
		const rows = await fetchReport(sql, telegramUserId);

		const header = "date,amount,category,note";
		const csvRows = rows.map((row) =>
			[row.created_at, row.amount, row.category, row.note ?? ""].join(",")
		);
		const csv = [header, ...csvRows].join("\n");

		await sendTelegramMessage(token, telegramUserId, csv);

		return Response.json({ ok: true, csv });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Something went wrong.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleList(sql: Sql, telegramUserId: number, token: string): Promise<Response> {
	try {
		const rows = await fetchRecent(sql, telegramUserId);

		const text = rows.length
			? rows.map((r) => `${r.amount} ${r.category}${r.note ? ` (${r.note})` : ""}`).join("\n")
			: "No expenses yet.";

		await sendTelegramMessage(token, telegramUserId, text);

		return Response.json({ ok: true, rows });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, "Something went wrong.");
		return Response.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function handleMigrate(sql: Sql, telegramUserId: number, token: string, adminIds: string | undefined): Promise<Response> {
	const unauthorized = await requireAdmin(sql, telegramUserId, token, adminIds);
	if (unauthorized) return unauthorized;
	try {
		await migrate(sql);
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

export async function handleAddExpense(sql: Sql, telegramUserId: number, text: string, token: string): Promise<Response> {
	try {
		const expense = parseExpense(text);
		await saveExpense(sql, telegramUserId, expense);
		await trySend(sql, token, telegramUserId, `Saved: ${expense.amount} ${expense.category}`);
		return Response.json({ ok: true, message: "Saved", expense });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid input";
		await saveLog(sql, telegramUserId, message);
		await trySend(sql, token, telegramUserId, message);
		return Response.json({ ok: false, error: message }, { status: 400 });
	}
}
