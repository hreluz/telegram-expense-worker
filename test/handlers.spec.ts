import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseExpense, handleReport, handleList, handleAddExpense, handleMigrate, handleLogs, handleDropPending } from "../src/handlers";
import type { Sql } from "../src/types";

const { mockFetchReport, mockFetchRecent, mockSaveExpense, mockMigrate, mockSaveLog, mockFetchLogs, mockSendTelegramMessage, mockDropPendingUpdates } = vi.hoisted(() => ({
	mockFetchReport: vi.fn().mockResolvedValue([]),
	mockFetchRecent: vi.fn().mockResolvedValue([]),
	mockSaveExpense: vi.fn().mockResolvedValue(undefined),
	mockMigrate: vi.fn().mockResolvedValue(undefined),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockFetchLogs: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockDropPendingUpdates: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db", () => ({
	fetchReport: mockFetchReport,
	fetchRecent: mockFetchRecent,
	saveExpense: mockSaveExpense,
	migrate: mockMigrate,
	saveLog: mockSaveLog,
	fetchLogs: mockFetchLogs,
}));

vi.mock("../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	dropPendingUpdates: mockDropPendingUpdates,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	mockFetchReport.mockResolvedValue([]);
	mockFetchRecent.mockResolvedValue([]);
	mockSaveExpense.mockResolvedValue(undefined);
	mockMigrate.mockResolvedValue(undefined);
	mockSaveLog.mockResolvedValue(undefined);
	mockFetchLogs.mockResolvedValue([]);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockDropPendingUpdates.mockResolvedValue(undefined);
});

describe("parseExpense", () => {
	it("parses amount and category", () => {
		expect(parseExpense("300 gym")).toMatchObject({ amount: 300, category: "gym", note: "" });
	});

	it("parses a multi-word note", () => {
		expect(parseExpense("50 food pizza night out")).toMatchObject({
			amount: 50,
			category: "food",
			note: "pizza night out",
		});
	});

	it("accepts decimal amounts", () => {
		expect(parseExpense("10.5 gym")).toMatchObject({ amount: 10.5 });
	});

	it("throws when category is missing", () => {
		expect(() => parseExpense("300")).toThrow("Use format: 300 gym");
	});

	it("throws when amount is not a number", () => {
		expect(() => parseExpense("abc gym")).toThrow("Amount must be a valid number");
	});

	it("throws when amount is zero", () => {
		expect(() => parseExpense("0 gym")).toThrow("Amount must be a valid number");
	});

	it("throws when amount is negative", () => {
		expect(() => parseExpense("-10 gym")).toThrow("Amount must be a valid number");
	});

	it("lowercases the category", () => {
		expect(parseExpense("300 GYM")).toMatchObject({ amount: 300, category: "gym", note: "" });
	});

	it("parses @date token with no note", () => {
		expect(parseExpense("300 gym @2026-06-10")).toMatchObject({ amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });
	});

	it("parses @date token followed by a note", () => {
		expect(parseExpense("300 gym @2026-06-10 bought shoes")).toMatchObject({ amount: 300, category: "gym", note: "bought shoes", expenseDate: "2026-06-10" });
	});

	it("parses @date token among note tokens", () => {
		expect(parseExpense("300 gym bought @2026-06-10 shoes")).toMatchObject({ amount: 300, category: "gym", note: "bought shoes", expenseDate: "2026-06-10" });
	});

	it("defaults expenseDate to today when no @date token is given", () => {
		const result = parseExpense("300 gym");
		expect(result.expenseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("treats @-prefixed non-date tokens as note words", () => {
		expect(parseExpense("300 gym @home")).toMatchObject({ note: "@home" });
	});

	it("throws for a calendar-invalid date", () => {
		expect(() => parseExpense("300 gym @2026-02-30")).toThrow("Invalid date. Use @YYYY-MM-DD format");
	});

	it("treats wrong date separator as a note token", () => {
		expect(parseExpense("300 gym @2026/06/10")).toMatchObject({ note: "@2026/06/10" });
	});

	it("first @date token wins, second becomes part of the note", () => {
		expect(parseExpense("300 gym @2026-06-10 @2026-06-11")).toMatchObject({ expenseDate: "2026-06-10", note: "@2026-06-11" });
	});
});

describe("handleReport", () => {
	it("returns only header when there are no expenses", async () => {
		const response = await handleReport(sql, 42, token);
		const body = await response.json() as { ok: boolean; csv: string };

		expect(body.ok).toBe(true);
		expect(body.csv).toBe("date,amount,category,note");
	});

	it("builds CSV rows from expenses", async () => {
		mockFetchReport.mockResolvedValue([
			{ expense_date: "2026-01-01", amount: 100, category: "food", note: "lunch" },
			{ expense_date: "2026-01-02", amount: 50, category: "gym", note: null },
		]);

		const response = await handleReport(sql, 42, token);
		const body = await response.json() as { csv: string };

		expect(body.csv).toBe(
			"date,amount,category,note\n2026-01-01,100,food,lunch\n2026-01-02,50,gym,"
		);
	});

	it("sends the CSV to the user via Telegram", async () => {
		await handleReport(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "date,amount,category,note");
	});

	it("logs the error and sends a generic message when fetchReport throws", async () => {
		mockFetchReport.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleReport(sql, 42, token);

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleList", () => {
	it("returns rows", async () => {
		const rows = [{ amount: 200, category: "transport", note: "taxi", created_at: "2026-01-01" }];
		mockFetchRecent.mockResolvedValue(rows);

		const response = await handleList(sql, 42, token);
		const body = await response.json() as { ok: boolean; rows: unknown[] };

		expect(body.ok).toBe(true);
		expect(body.rows).toEqual(rows);
	});

	it("returns empty array when no expenses", async () => {
		const response = await handleList(sql, 42, token);
		const body = await response.json() as { rows: unknown[] };

		expect(body.rows).toEqual([]);
	});

	it("sends formatted list to the user via Telegram", async () => {
		mockFetchRecent.mockResolvedValue([
			{ amount: 200, category: "transport", note: "taxi", created_at: "2026-01-01" },
			{ amount: 50, category: "gym", note: null, created_at: "2026-01-02" },
		]);

		await handleList(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "200 transport (taxi)\n50 gym");
	});

	it("sends 'No expenses yet.' when list is empty", async () => {
		await handleList(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No expenses yet.");
	});

	it("logs the error and sends a generic message when fetchRecent throws", async () => {
		mockFetchRecent.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleList(sql, 42, token);

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleMigrate", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleMigrate(sql, 42, token, undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 403 when user is not in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "999,888");

		expect(response.status).toBe(403);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("runs migration and replies when user is in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "42,99");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockMigrate).toHaveBeenCalledWith(sql);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Migration complete.");
	});

	it("trims spaces around IDs in ADMIN_IDS", async () => {
		const response = await handleMigrate(sql, 42, token, " 42 , 99 ");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
	});

	it("logs the error and sends a failure message when migrate throws", async () => {
		mockMigrate.mockRejectedValue(new Error("Migration error"));

		const response = await handleMigrate(sql, 42, token, "42");

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "Migration error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Migration failed.");
	});
});

describe("handleLogs", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleLogs(sql, 42, token, undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 403 when user is not in the allowed list", async () => {
		const response = await handleLogs(sql, 42, token, "999,888");

		expect(response.status).toBe(403);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("sends 'No logs.' when there are no logs", async () => {
		await handleLogs(sql, 42, token, "42");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No logs.");
	});

	it("sends formatted log entries", async () => {
		mockFetchLogs.mockResolvedValue([
			{ message: "DB connection failed", created_at: "2026-01-01T10:00:00Z" },
		]);

		await handleLogs(sql, 42, token, "42");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "[2026-01-01T10:00:00Z] DB connection failed");
	});

	it("returns rows in the response", async () => {
		const rows = [{ message: "DB connection failed", created_at: "2026-01-01T10:00:00Z" }];
		mockFetchLogs.mockResolvedValue(rows);

		const response = await handleLogs(sql, 42, token, "42");
		const body = await response.json() as { ok: boolean; rows: unknown[] };

		expect(body.ok).toBe(true);
		expect(body.rows).toEqual(rows);
	});

	it("returns 500 and sends a generic message when fetchLogs throws", async () => {
		mockFetchLogs.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleLogs(sql, 42, token, "42");

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleAddExpense", () => {
	it("saves the expense and returns it", async () => {
		const response = await handleAddExpense(sql, 42, "300 gym", token);
		const body = await response.json() as { ok: boolean; message: string; expense: object };

		expect(body.ok).toBe(true);
		expect(body.message).toBe("Saved");
		expect(body.expense).toMatchObject({ amount: 300, category: "gym", note: "" });
		expect(mockSaveExpense).toHaveBeenCalledWith(sql, 42, expect.objectContaining({ amount: 300, category: "gym", note: "" }));
	});

	it("sends a confirmation to the user via Telegram", async () => {
		await handleAddExpense(sql, 42, "300 gym", token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringMatching(/^Saved: 300 gym\nDate: \d{4}-\d{2}-\d{2}$/));
	});

	it("includes note in confirmation when present", async () => {
		await handleAddExpense(sql, 42, "300 gym bought shoes", token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringMatching(/^Saved: 300 gym\nDate: \d{4}-\d{2}-\d{2}\nNote: bought shoes$/));
	});

	it("returns 400 and logs when parsing fails", async () => {
		const response = await handleAddExpense(sql, 42, "300", token);

		expect(response.status).toBe(400);
		const body = await response.json() as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect(body.error).toBe("Use format: 300 gym");
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "Use format: 300 gym");
	});

	it("sends the error message to the user via Telegram on failure", async () => {
		await handleAddExpense(sql, 42, "300", token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use format: 300 gym");
	});

	it("returns 400 and logs when the db throws", async () => {
		mockSaveExpense.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleAddExpense(sql, 42, "300 gym", token);

		expect(response.status).toBe(400);
		const body = await response.json() as { error: string };
		expect(body.error).toBe("DB connection failed");
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
	});
});

describe("handleDropPending", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 403 when user is not in the allowed list", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", "999");

		expect(response.status).toBe(403);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("calls dropPendingUpdates and replies when user is admin", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", "42");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockDropPendingUpdates).toHaveBeenCalledWith(token, "https://example.com");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Pending updates dropped.");
	});

	it("logs the error and sends a failure message when dropPendingUpdates throws", async () => {
		mockDropPendingUpdates.mockRejectedValue(new Error("Telegram API error 400: Bad Request"));

		const response = await handleDropPending(sql, 42, token, "https://example.com", "42");

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "Telegram API error 400: Bad Request");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Failed to drop pending updates.");
	});
});
