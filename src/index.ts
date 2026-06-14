import { neon } from "@neondatabase/serverless";

type Env = {
	DATABASE_URL: string;
};

function parseExpense(text: string) {
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		
		if (request.method !== "POST") {
			return new Response("Telegram Expense Worker is running");
		}

		const body: any = await request.json();
		const text = body?.message?.text;
		const telegramUserId = body?.message?.from?.id ?? 123456789;
		const sql = neon(env.DATABASE_URL);
		
		if (text === "/report") {
			const rows = await sql`
				SELECT created_at, amount, category, note
				FROM expenses
				WHERE telegram_user_id = ${telegramUserId}
				ORDER BY created_at DESC
			`;

			const header = "date,amount,category,note";

			const csvRows = rows.map((row) => {
				return [
					row.created_at,
					row.amount,
					row.category,
					row.note ?? "",
				].join(",");
			});

			const csv = [header, ...csvRows].join("\n");

			return Response.json({
				ok: true,
				csv,
			});
		}

		if (text === "/list") {
			const rows = await sql`
				SELECT amount, category, note, created_at
				FROM expenses
				WHERE telegram_user_id = ${telegramUserId}
				ORDER BY created_at DESC
				LIMIT 10
			`;

			return Response.json({
				ok: true,
				rows,
			});
		}

		if (!text) {
			return Response.json({ error: "No text found" }, { status: 400 });
		}

		try {
			const expense = parseExpense(text);
			await sql`
				INSERT INTO expenses (
					telegram_user_id,
					amount,
					category,
					note
				)
				VALUES (
					${telegramUserId},
					${expense.amount},
					${expense.category},
					${expense.note}
				)
			`;

			return Response.json({
				ok: true,
				message: "Saved",
				expense,
			});
		} catch (error) {
			return Response.json(
				{
					ok: false,
					error: error instanceof Error ? error.message : "Invalid input",
				},
				{ status: 400 }
			);
		}
	},
} satisfies ExportedHandler<Env>;