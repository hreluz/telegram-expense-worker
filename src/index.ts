import { neon } from "@neondatabase/serverless";
import type { Env, TelegramBody } from "./types";
import { handleReport, handleList, handleAddExpense, handleMigrate, handleLogs, handleDropPending, handleHelp, handleDelete, handleSummary, handleUndo, handleBudget, handleSearch, handleCallbackQuery, handleRename } from "./handlers";

function parseViewAndFilter(args: string): { view: 'expenses' | 'categories'; filter: string | undefined } {
	const [first, ...rest] = args.split(/\s+/);
	if (first === 'categories' || first === 'expenses') {
		return { view: first, filter: rest.join(' ') || undefined };
	}
	return { view: 'expenses', filter: args || undefined };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Telegram Expense Worker is running");
		}

		const body = (await request.json()) as TelegramBody;
		const sql = neon(env.DATABASE_URL);

		if (body?.callback_query) {
			return handleCallbackQuery(sql, body.callback_query, env.TELEGRAM_TOKEN);
		}

		const text = body?.message?.text;
		const telegramUserId = body?.message?.from?.id ?? 123456789;

		if (!text) {
			return Response.json({ error: "No text found" });
		}

		if (text === "/summary") return handleSummary(sql, telegramUserId, env.TELEGRAM_TOKEN);
		if (text === "/undo") return handleUndo(sql, telegramUserId, env.TELEGRAM_TOKEN);
		if (text.startsWith("/budget")) return handleBudget(sql, telegramUserId, env.TELEGRAM_TOKEN, text.slice(7).trim());
		if (text === "/start") return handleHelp(sql, telegramUserId, env.TELEGRAM_TOKEN);
		if (text === "/help") return handleHelp(sql, telegramUserId, env.TELEGRAM_TOKEN);
		if (text === "/migrate") return handleMigrate(sql, telegramUserId, env.TELEGRAM_TOKEN, env.ADMIN_IDS);
		if (text === "/logs") return handleLogs(sql, telegramUserId, env.TELEGRAM_TOKEN, env.ADMIN_IDS);
		if (text === "/droppending") return handleDropPending(sql, telegramUserId, env.TELEGRAM_TOKEN, new URL(request.url).origin, env.ADMIN_IDS);
		if (text.startsWith("/report")) {
			const args = text.slice(7).trim();
			const { view, filter } = parseViewAndFilter(args);
			return handleReport(sql, telegramUserId, env.TELEGRAM_TOKEN, view, filter);
		}
		if (text.startsWith("/list")) {
			const args = text.slice(5).trim();
			const { view, filter } = parseViewAndFilter(args);
			return handleList(sql, telegramUserId, env.TELEGRAM_TOKEN, view, filter);
		}
		if (text.startsWith("/rename")) {
			return handleRename(sql, telegramUserId, env.TELEGRAM_TOKEN, text.slice(7).trim());
		}
		if (text.startsWith("/search")) {
			const keyword = text.slice(7).trim();
			return handleSearch(sql, telegramUserId, env.TELEGRAM_TOKEN, keyword);
		}
		if (text.startsWith("/delete")) {
			const args = text.slice(7).trim();
			return handleDelete(sql, telegramUserId, env.TELEGRAM_TOKEN, args);
		}

		return handleAddExpense(sql, telegramUserId, text, env.TELEGRAM_TOKEN);
	},
} satisfies ExportedHandler<Env>;
