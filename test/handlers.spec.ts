import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseExpense, handleReport, handleList, handleAddExpense, handleMigrate, handleLogs, handleDropPending, handleHelp, handleDelete, handleSummary, HELP_TEXT } from "../src/handlers";
import type { Sql } from "../src/types";

const { mockFetchReport, mockFetchRecent, mockFetchCategoryTotals, mockSaveExpense, mockMigrate, mockSaveLog, mockFetchLogs, mockDeleteExpense, mockFetchBiggestExpense, mockSendTelegramMessage, mockSendTelegramDocument, mockDropPendingUpdates, mockSetTelegramCommands } = vi.hoisted(() => ({
	mockFetchReport: vi.fn().mockResolvedValue([]),
	mockFetchRecent: vi.fn().mockResolvedValue([]),
	mockFetchCategoryTotals: vi.fn().mockResolvedValue([]),
	mockSaveExpense: vi.fn().mockResolvedValue(undefined),
	mockMigrate: vi.fn().mockResolvedValue(undefined),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockFetchLogs: vi.fn().mockResolvedValue([]),
	mockDeleteExpense: vi.fn().mockResolvedValue({ found: true, categoryDeleted: false }),
	mockFetchBiggestExpense: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramDocument: vi.fn().mockResolvedValue(undefined),
	mockDropPendingUpdates: vi.fn().mockResolvedValue(undefined),
	mockSetTelegramCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db", () => ({
	fetchReport: mockFetchReport,
	fetchRecent: mockFetchRecent,
	fetchCategoryTotals: mockFetchCategoryTotals,
	saveExpense: mockSaveExpense,
	migrate: mockMigrate,
	saveLog: mockSaveLog,
	fetchLogs: mockFetchLogs,
	deleteExpense: mockDeleteExpense,
	fetchBiggestExpense: mockFetchBiggestExpense,
}));

vi.mock("../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	sendTelegramDocument: mockSendTelegramDocument,
	dropPendingUpdates: mockDropPendingUpdates,
	setTelegramCommands: mockSetTelegramCommands,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchReport.mockResolvedValue([]);
	mockFetchRecent.mockResolvedValue([]);
	mockFetchCategoryTotals.mockResolvedValue([]);
	mockSaveExpense.mockResolvedValue(undefined);
	mockMigrate.mockResolvedValue(undefined);
	mockSaveLog.mockResolvedValue(undefined);
	mockFetchLogs.mockResolvedValue([]);
	mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });
	mockFetchBiggestExpense.mockResolvedValue([]);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockSendTelegramDocument.mockResolvedValue(undefined);
	mockDropPendingUpdates.mockResolvedValue(undefined);
	mockSetTelegramCommands.mockResolvedValue(undefined);
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
		expect(() => parseExpense("300")).toThrow("Format:");
	});

	it("throws when amount is not a number", () => {
		expect(() => parseExpense("abc gym")).toThrow("Format:");
	});

	it("throws when amount is zero", () => {
		expect(() => parseExpense("0 gym")).toThrow("Format:");
	});

	it("throws when amount is negative", () => {
		expect(() => parseExpense("-10 gym")).toThrow("Format:");
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

describe("handleHelp", () => {
	it("sends HELP_TEXT to the user", async () => {
		await handleHelp(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, HELP_TEXT);
	});

	it("returns ok", async () => {
		const response = await handleHelp(sql, 42, token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
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

	it("sends the CSV as a file to the user via Telegram", async () => {
		await handleReport(sql, 42, token);

		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "expenses.csv", "date,amount,category,note");
	});

	it("sends a filtered CSV with year and uses a named filename", async () => {
		await handleReport(sql, 42, token, 'expenses', "2026");

		expect(mockFetchReport).toHaveBeenCalledWith(sql, 42, "2026");
		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "expenses-2026.csv", "date,amount,category,note");
	});

	it("sends a filtered CSV with month and uses a named filename", async () => {
		await handleReport(sql, 42, token, 'expenses', "2026-05");

		expect(mockFetchReport).toHaveBeenCalledWith(sql, 42, "2026-05");
		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "expenses-2026-05.csv", "date,amount,category,note");
	});

	it("sends a filtered CSV with day and uses a named filename", async () => {
		await handleReport(sql, 42, token, 'expenses', "2026-05-01");

		expect(mockFetchReport).toHaveBeenCalledWith(sql, 42, "2026-05-01");
		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "expenses-2026-05-01.csv", "date,amount,category,note");
	});

	it("returns 200 and sends error when filter format is invalid", async () => {
		const response = await handleReport(sql, 42, token, 'expenses', "june");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringContaining("Invalid date filter"));
		expect(mockFetchReport).not.toHaveBeenCalled();
	});

	it("logs the error and sends a generic message when fetchReport throws", async () => {
		mockFetchReport.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleReport(sql, 42, token);

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleReport categories", () => {
	it("sends category totals as CSV", async () => {
		mockFetchCategoryTotals.mockResolvedValue([
			{ category: "gym", total: 500 },
			{ category: "food", total: 200 },
		]);

		const response = await handleReport(sql, 42, token, 'categories');
		const body = await response.json() as { ok: boolean; csv: string };

		expect(body.ok).toBe(true);
		expect(body.csv).toBe("category,total\ngym,500\nfood,200");
	});

	it("sends categories.csv filename with no filter", async () => {
		await handleReport(sql, 42, token, 'categories');

		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "categories.csv", "category,total");
	});

	it("sends named filename with filter", async () => {
		await handleReport(sql, 42, token, 'categories', "2026-05");

		expect(mockFetchCategoryTotals).toHaveBeenCalledWith(sql, 42, "2026-05");
		expect(mockSendTelegramDocument).toHaveBeenCalledWith(token, 42, "categories-2026-05.csv", "category,total");
	});

	it("returns 200 and sends error when filter format is invalid", async () => {
		const response = await handleReport(sql, 42, token, 'categories', "june");

		expect(response.status).toBe(200);
		expect(mockFetchCategoryTotals).not.toHaveBeenCalled();
	});

	it("logs the error and sends a generic message when fetchCategoryTotals throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleReport(sql, 42, token, 'categories');

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleList", () => {
	it("returns rows", async () => {
		const rows = [{ amount: 200, category: "transport", note: "taxi", expense_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" }];
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

	it("sends formatted list with header and IDs to the user via Telegram", async () => {
		mockFetchRecent.mockResolvedValue([
			{ id: 1, amount: 200, category: "transport", note: "taxi", expense_date: "2026-01-02", created_at: "2026-01-02T00:00:00Z" },
			{ id: 2, amount: 50, category: "gym", note: null, expense_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
		]);

		await handleList(sql, 42, token);

		const expected = [
			"ID    Date        Amount    Category      Note",
			"#1    2026-01-02  200       transport     taxi",
			"#2    2026-01-01  50        gym",
		].join("\n");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expected);
	});

	it("sends 'No expenses yet.' when list is empty", async () => {
		await handleList(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No expenses yet.");
	});

	it("passes year filter to fetchRecent", async () => {
		await handleList(sql, 42, token, 'expenses', "2026");

		expect(mockFetchRecent).toHaveBeenCalledWith(sql, 42, "2026");
	});

	it("passes month filter to fetchRecent", async () => {
		await handleList(sql, 42, token, 'expenses', "2026-05");

		expect(mockFetchRecent).toHaveBeenCalledWith(sql, 42, "2026-05");
	});

	it("passes day filter to fetchRecent", async () => {
		await handleList(sql, 42, token, 'expenses', "2026-05-01");

		expect(mockFetchRecent).toHaveBeenCalledWith(sql, 42, "2026-05-01");
	});

	it("returns 200 and sends error when filter format is invalid", async () => {
		const response = await handleList(sql, 42, token, 'expenses', "june");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringContaining("Invalid date filter"));
		expect(mockFetchRecent).not.toHaveBeenCalled();
	});

	it("logs the error and sends a generic message when fetchRecent throws", async () => {
		mockFetchRecent.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleList(sql, 42, token);

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleList categories", () => {
	it("sends category totals as a message", async () => {
		mockFetchCategoryTotals.mockResolvedValue([
			{ category: "gym", total: 500 },
			{ category: "food", total: 200 },
		]);

		await handleList(sql, 42, token, 'categories');

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "gym  500\nfood  200");
	});

	it("sends 'No expenses yet.' when there are no rows", async () => {
		await handleList(sql, 42, token, 'categories');

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No expenses yet.");
	});

	it("passes filter to fetchCategoryTotals", async () => {
		await handleList(sql, 42, token, 'categories', "2026-05");

		expect(mockFetchCategoryTotals).toHaveBeenCalledWith(sql, 42, "2026-05");
	});

	it("returns 200 when filter format is invalid", async () => {
		const response = await handleList(sql, 42, token, 'categories', "june");

		expect(response.status).toBe(200);
		expect(mockFetchCategoryTotals).not.toHaveBeenCalled();
	});

	it("logs the error and sends a generic message when fetchCategoryTotals throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleList(sql, 42, token, 'categories');

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

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "999,888");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("runs migration, sets commands, and replies when user is in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "42,99");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockMigrate).toHaveBeenCalledWith(sql);
		expect(mockSetTelegramCommands).toHaveBeenCalledWith(token);
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

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleLogs(sql, 42, token, "999,888");

		expect(response.status).toBe(200);
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

	it("returns 200 and logs when parsing fails", async () => {
		const response = await handleAddExpense(sql, 42, "300", token);

		expect(response.status).toBe(200);
		const body = await response.json() as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect((body.error as string)).toContain("Format:");
		expect((mockSaveLog.mock.calls[0][2] as string)).toContain("Format:");
	});

	it("sends the format hint to the user via Telegram on failure", async () => {
		await handleAddExpense(sql, 42, "300", token);

		expect((mockSendTelegramMessage.mock.calls[0][2] as string)).toContain("Format:");
	});

	it("returns 200 and logs when the db throws", async () => {
		mockSaveExpense.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleAddExpense(sql, 42, "300 gym", token);

		expect(response.status).toBe(200);
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

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", "999");

		expect(response.status).toBe(200);
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

describe("handleDelete", () => {
	it("deletes an expense and sends confirmation", async () => {
		mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });

		const response = await handleDelete(sql, 42, token, "10");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockDeleteExpense).toHaveBeenCalledWith(sql, 42, 10);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Deleted expense #10.");
	});

	it("returns 200 and sends 'Expense not found.' when expense does not exist", async () => {
		mockDeleteExpense.mockResolvedValue({ found: false, categoryDeleted: false });

		const response = await handleDelete(sql, 42, token, "99");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Expense not found.");
	});

	it("returns 200 and sends usage hint when ID is not a number", async () => {
		const response = await handleDelete(sql, 42, token, "abc");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Invalid ID. Use: /delete <id>");
		expect(mockDeleteExpense).not.toHaveBeenCalled();
	});

	it("returns 200 and sends usage hint when no ID is given", async () => {
		const response = await handleDelete(sql, 42, token, "");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use: /delete <id>");
		expect(mockDeleteExpense).not.toHaveBeenCalled();
	});

	it("logs error and sends generic message when deleteExpense throws", async () => {
		mockDeleteExpense.mockRejectedValue(new Error("DB error"));

		const response = await handleDelete(sql, 42, token, "5");

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleSummary", () => {
	it("sends 'no expenses' message when there are no expenses this month", async () => {
		mockFetchCategoryTotals.mockResolvedValue([]);

		const response = await handleSummary(sql, 42, token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringContaining("No expenses recorded for"));
		expect(mockFetchBiggestExpense).not.toHaveBeenCalled();
	});

	it("sends full summary with top categories, totals, and biggest expense", async () => {
		mockFetchCategoryTotals
			.mockResolvedValueOnce([
				{ category: "gym", total: "450.00" },
				{ category: "groceries", total: "380.00" },
				{ category: "coffee", total: "120.00" },
			])
			.mockResolvedValueOnce([{ category: "gym", total: "930.00" }]);
		mockFetchBiggestExpense.mockResolvedValue([
			{ id: 42, amount: "300.00", category: "gym", note: "bought shoes", expense_date: "2026-06-10" },
		]);

		const response = await handleSummary(sql, 42, token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("Total spent:");
		expect(sent).toContain("Last month:");
		expect(sent).toContain("gym");
		expect(sent).toContain("groceries");
		expect(sent).toContain("Biggest expense:");
		expect(sent).toContain("#42");
		expect(sent).toContain("bought shoes");
	});

	it("omits 'Last month' line when last month has no expenses", async () => {
		mockFetchCategoryTotals
			.mockResolvedValueOnce([{ category: "gym", total: "300.00" }])
			.mockResolvedValueOnce([]);
		mockFetchBiggestExpense.mockResolvedValue([
			{ id: 1, amount: "300.00", category: "gym", note: "", expense_date: "2026-06-01" },
		]);

		await handleSummary(sql, 42, token);

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).not.toContain("Last month:");
	});

	it("omits note from biggest expense when note is empty", async () => {
		mockFetchCategoryTotals
			.mockResolvedValueOnce([{ category: "gym", total: "300.00" }])
			.mockResolvedValueOnce([]);
		mockFetchBiggestExpense.mockResolvedValue([
			{ id: 1, amount: "300.00", category: "gym", note: "", expense_date: "2026-06-01" },
		]);

		await handleSummary(sql, 42, token);

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("#1  300.00  gym  (2026-06-01)");
	});

	it("logs error and sends generic message when db throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB down"));

		const response = await handleSummary(sql, 42, token);

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB down");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});
