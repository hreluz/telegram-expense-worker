import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";

const { mockSql, mockSendTelegramMessage } = vi.hoisted(() => ({
	mockSql: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@neondatabase/serverless", () => ({
	neon: () => mockSql,
}));

vi.mock("../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
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
		mockSql.mockResolvedValue([]);
		mockSendTelegramMessage.mockResolvedValue(undefined);
	});

	it("returns running message on non-POST request", async () => {
		const request = new Request("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Telegram Expense Worker is running");
	});

	it("returns 400 when message has no text", async () => {
		const request = postRequest({ message: { from: { id: 42 } } });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "No text found" });
	});

	describe("/start", () => {
		it("returns ok without sending a Telegram message", async () => {
			const request = postRequest(telegramMessage("/start"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const body = await response.json() as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(mockSendTelegramMessage).not.toHaveBeenCalled();
		});
	});

	describe("/migrate", () => {
		it("returns 500 when ADMIN_IDS is not configured", async () => {
			const request = postRequest(telegramMessage("/migrate"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(500);
			const body = await response.json() as { error: string };
			expect(body.error).toBe("ADMIN_IDS is not configured");
		});

		it("returns 403 when user is not in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/migrate", 999));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(403);
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
		it("returns 500 when ADMIN_IDS is not configured", async () => {
			const request = postRequest(telegramMessage("/logs"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(500);
			const body = await response.json() as { error: string };
			expect(body.error).toBe("ADMIN_IDS is not configured");
		});

		it("returns 403 when user is not in ADMIN_IDS", async () => {
			const request = postRequest(telegramMessage("/logs", 999));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, adminEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(403);
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

	describe("/report", () => {
		it("returns CSV with header and rows", async () => {
			mockSql.mockResolvedValue([
				{ created_at: "2026-01-01", amount: 100, category: "food", note: "lunch" },
				{ created_at: "2026-01-02", amount: 50, category: "gym", note: null },
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
	});

	describe("add expense", () => {
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

			expect(response.status).toBe(400);
			const body = await response.json() as { ok: boolean; error: string };
			expect(body.ok).toBe(false);
			expect(body.error).toBe("Use format: 300 gym");
		});

		it("returns 400 when amount is not a number", async () => {
			const request = postRequest(telegramMessage("abc gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
			const body = await response.json() as { error: string };
			expect(body.error).toBe("Amount must be a valid number");
		});

		it("returns 400 when amount is zero", async () => {
			const request = postRequest(telegramMessage("0 gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
		});

		it("returns 400 when amount is negative", async () => {
			const request = postRequest(telegramMessage("-10 gym"));
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);
		});
	});
});
