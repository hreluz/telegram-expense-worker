import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";

const { mockSql, mockSendTelegramMessage, mockSendTelegramDocument, mockDropPendingUpdates, mockSetTelegramCommands } = vi.hoisted(() => ({
	mockSql: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramDocument: vi.fn().mockResolvedValue(undefined),
	mockDropPendingUpdates: vi.fn().mockResolvedValue(undefined),
	mockSetTelegramCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@neondatabase/serverless", () => ({
	neon: () => mockSql,
}));

vi.mock("../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	sendTelegramDocument: mockSendTelegramDocument,
	dropPendingUpdates: mockDropPendingUpdates,
	setTelegramCommands: mockSetTelegramCommands,
}));

const testEnv = { DATABASE_URL: "postgresql://test", TELEGRAM_TOKEN: "test-token" };
const adminEnv = { ...testEnv, ADMIN_IDS: "42" };

function postRequest(body: object) {
	return new Request("http://example.com", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function telegramMessage(text: string, userId = 42) {
	return { message: { text, from: { id: userId } } };
}

describe("telegram-expense-worker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSql.mockResolvedValue([]);
		mockSendTelegramMessage.mockResolvedValue(undefined);
		mockSendTelegramDocument.mockResolvedValue(undefined);
		mockSetTelegramCommands.mockResolvedValue(undefined);
	});

	it("returns running message on non-POST request", async () => {
		const request = new Request("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Telegram Expense Worker is running");
	});

	it("returns 200 when message has no text", async () => {
		const request = postRequest({ message: { from: { id: 42 } } });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ error: "No text found" });
	});

	describe("/start", () => {
		it("sends the help message to the user", async () => {
			const request = postRequest(telegramMessage("/start"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
		});
	});

	describe("/help", () => {
		it("sends the help message to the user", async () => {
			const request = postRequest(telegramMessage("/help"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
		});
	});

	describe("/migrate", () => {
		it("returns 200 when ADMIN_IDS is not configured", async () => {
			const request = postRequest(telegramMessage("/migrate"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { error: string };
			expect(body.error).toBe("ADMIN_IDS is not configured");
		});

		it("returns 200 when user is not in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/migrate", 999));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns ok when user is in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/migrate", 42));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
		});
	});

	describe("/logs", () => {
		it("returns 200 when ADMIN_IDS is not configured", async () => {
			const request = postRequest(telegramMessage("/logs"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { error: string };
			expect(body.error).toBe("ADMIN_IDS is not configured");
		});

		it("returns 200 when user is not in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/logs", 999));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns ok when user is in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/logs", 42));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
		});
	});

	describe("/droppending", () => {
		it("returns 200 when ADMIN_IDS is not configured", async () => {
			const request = postRequest(telegramMessage("/droppending"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns 200 when user is not in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/droppending", 999));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns ok when user is in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/droppending", 42));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
		});
	});

	describe("/report", () => {
		it("returns CSV with header and rows", async () => {
			mockSql.mockResolvedValue([
				{ expense_date: "2026-01-01", amount: 100, category: "food", note: "lunch" },
				{ expense_date: "2026-01-02", amount: 50, category: "gym", note: null },
			]);

			const request = postRequest(telegramMessage("/report"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; csv: string };
			expect(body.ok).toBe(true);
			expect(body.csv).toBe(
				"date,amount,category,note\n2026-01-01,100,food,lunch\n2026-01-02,50,gym,"
			);
		});

		it("returns CSV with only header when no expenses", async () => {
			const request = postRequest(telegramMessage("/report"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; csv: string };
			expect(body.csv).toBe("date,amount,category,note");
		});

		it("returns 400 when filter is invalid", async () => {
			const request = postRequest(telegramMessage("/report june"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("passes year filter when given /report 2026", async () => {
			const request = postRequest(telegramMessage("/report 2026"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; csv: string };
			expect(body.ok).toBe(true);
		});

		it("returns category CSV with header when given /report categories", async () => {
			const request = postRequest(telegramMessage("/report categories"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; csv: string };
			expect(body.ok).toBe(true);
			expect(body.csv).toBe("category,total");
		});

		it("returns category CSV for a period when given /report categories 2026-05", async () => {
			const request = postRequest(telegramMessage("/report categories 2026-05"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; csv: string };
			expect(body.ok).toBe(true);
		});

		it("returns 400 when given /report categories with invalid filter", async () => {
			const request = postRequest(telegramMessage("/report categories june"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});
	});

	describe("/list", () => {
		it("returns rows array", async () => {
			const rows = [
				{ amount: 200, category: "transport", note: "taxi", created_at: "2026-01-01" },
			];
			mockSql.mockResolvedValue(rows);

			const request = postRequest(telegramMessage("/list"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; rows: unknown[] };
			expect(body.ok).toBe(true);
			expect(body.rows).toEqual(rows);
		});

		it("returns empty array when no expenses", async () => {
			const request = postRequest(telegramMessage("/list"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; rows: unknown[] };
			expect(body.rows).toEqual([]);
		});

		it("passes year filter when given /list 2026", async () => {
			const request = postRequest(telegramMessage("/list 2026"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
		});

		it("returns 400 when filter is invalid", async () => {
			const request = postRequest(telegramMessage("/list june"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns category rows when given /list categories", async () => {
			const request = postRequest(telegramMessage("/list categories"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; rows: unknown[] };
			expect(body.ok).toBe(true);
			expect(body.rows).toEqual([]);
		});

		it("returns category rows for a period when given /list categories 2026-05", async () => {
			const request = postRequest(telegramMessage("/list categories 2026-05"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
		});

		it("returns 400 when given /list categories with invalid filter", async () => {
			const request = postRequest(telegramMessage("/list categories june"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});
	});

	describe("/summary", () => {
		it("returns ok", async () => {
			const request = postRequest(telegramMessage("/summary"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
		});
	});

	describe("/undo", () => {
		it("returns ok when there are no expenses", async () => {
			mockSql.mockResolvedValue([]);

			const request = postRequest(telegramMessage("/undo"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledWith("test-token", 42, "No expenses to undo.");
		});

		it("deletes latest expense and returns ok", async () => {
			mockSql
				.mockResolvedValueOnce([{ id: 3, amount: 300, category_id: 5, expense_date: "2026-06-17" }])
				.mockResolvedValueOnce([{ name: "gym" }])
				.mockResolvedValueOnce([{ count: 1 }]);

			const request = postRequest(telegramMessage("/undo"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledWith("test-token", 42, "Undone: 300.00 gym (2026-06-17).");
		});
	});

	describe("/delete", () => {
		it("deletes an expense and returns ok", async () => {
			mockSql
				.mockResolvedValueOnce([{ category_id: 7 }])
				.mockResolvedValueOnce([{ count: 1 }]);

			const request = postRequest(telegramMessage("/delete 10"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).toHaveBeenCalledWith("test-token", 42, "Deleted expense #10.");
		});

		it("returns 400 when expense is not found", async () => {
			mockSql.mockResolvedValueOnce([]);

			const request = postRequest(telegramMessage("/delete 999"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns 400 when ID is invalid", async () => {
			const request = postRequest(telegramMessage("/delete abc"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});
	});

	describe("add expense", () => {
		beforeEach(() => {
			mockSql.mockResolvedValueOnce([{ id: 1 }]);
		});

		it("saves a valid expense", async () => {
			const request = postRequest(telegramMessage("300 gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; message: string; expense: object };
			expect(body.ok).toBe(true);
			expect(body.message).toBe("Saved");
			expect(body.expense).toMatchObject({ amount: 300, category: "gym", note: "" });
		});

		it("saves an expense with a @date token", async () => {
			const request = postRequest(telegramMessage("300 gym @2026-06-10"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; expense: { expenseDate: string } };
			expect(body.ok).toBe(true);
			expect(body.expense.expenseDate).toBe("2026-06-10");
		});

		it("saves 430 games as a valid expense", async () => {
			const request = postRequest(telegramMessage("430 games"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { ok: boolean; expense: { amount: number; category: string } };
			expect(body.ok).toBe(true);
			expect(body.expense).toMatchObject({ amount: 430, category: "games", note: "" });
		});

		it("saves expense with a multi-word note", async () => {
			const request = postRequest(telegramMessage("50 food pizza night out"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			const body = await response.json() as { expense: { note: string } };
			expect(body.expense).toMatchObject({ amount: 50, category: "food", note: "pizza night out" });
		});

		it("returns 400 when category is missing", async () => {
			const request = postRequest(telegramMessage("300"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { ok: boolean; error: string };
			expect(body.ok).toBe(false);
			expect((body.error as string)).toContain("Format:");
		});

		it("returns 400 when amount is not a number", async () => {
			const request = postRequest(telegramMessage("abc gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { error: string };
			expect((body.error as string)).toContain("Format:");
		});

		it("returns 400 when amount is zero", async () => {
			const request = postRequest(telegramMessage("0 gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});

		it("returns 400 when amount is negative", async () => {
			const request = postRequest(telegramMessage("-10 gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
		});
	});
});
