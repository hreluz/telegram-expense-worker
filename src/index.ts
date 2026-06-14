import { neon } from "@neondatabase/serverless";
import type { Env, TelegramBody } from "./types";
import { handleReport, handleList, handleAddExpense } from "./handlers";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Telegram Expense Worker is running");
		}

		const body = (await request.json()) as TelegramBody;
		const text = body?.message?.text;
		const telegramUserId = body?.message?.from?.id ?? 123456789;
		const sql = neon(env.DATABASE_URL);

		if (!text) {
			return Response.json({ error: "No text found" }, { status: 400 });
		}

		if (text === "/report") return handleReport(sql, telegramUserId);
		if (text === "/list") return handleList(sql, telegramUserId);

		return handleAddExpense(sql, telegramUserId, text);
	},
} satisfies ExportedHandler<Env>;
