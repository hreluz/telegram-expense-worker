import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleHelp, handleReport, handleList, handleSearch, handleTop } from "../../src/handlers/views";
import { HELP_TEXT } from "../../src/handlers/utils";
import type { Sql } from "../../src/types";

const { mockFetchReport, mockFetchRecent, mockFetchCategoryTotals, mockSaveLog, mockSearchExpenses, mockFetchTopExpenses, mockSendTelegramMessage, mockSendTelegramDocument } = vi.hoisted(() => ({
	mockFetchReport: vi.fn().mockResolvedValue([]),
	mockFetchRecent: vi.fn().mockResolvedValue([]),
	mockFetchCategoryTotals: vi.fn().mockResolvedValue([]),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockSearchExpenses: vi.fn().mockResolvedValue([]),
	mockFetchTopExpenses: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	fetchReport: mockFetchReport,
	fetchRecent: mockFetchRecent,
	fetchCategoryTotals: mockFetchCategoryTotals,
	saveLog: mockSaveLog,
	searchExpenses: mockSearchExpenses,
	fetchTopExpenses: mockFetchTopExpenses,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	sendTelegramDocument: mockSendTelegramDocument,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchReport.mockResolvedValue([]);
	mockFetchRecent.mockResolvedValue([]);
	mockFetchCategoryTotals.mockResolvedValue([]);
	mockSaveLog.mockResolvedValue(undefined);
	mockSearchExpenses.mockResolvedValue([]);
	mockFetchTopExpenses.mockResolvedValue([]);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockSendTelegramDocument.mockResolvedValue(undefined);
});

describe("handleHelp", () => {
	it("sends HELP_TEXT to the user", async () => {
		await handleHelp(sql, 42, token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, HELP_TEXT, 'HTML');
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

	it("returns 200 and sends the error message when fetchReport throws", async () => {
		mockFetchReport.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleReport(sql, 42, token);

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB connection failed");
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

	it("returns 200 and sends the error message when fetchCategoryTotals throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleReport(sql, 42, token, 'categories');

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB connection failed");
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

	it("returns 200 and sends the error message when fetchRecent throws", async () => {
		mockFetchRecent.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleList(sql, 42, token);

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB connection failed");
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

	it("returns 200 and sends the error message when fetchCategoryTotals throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleList(sql, 42, token, 'categories');

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB connection failed");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB connection failed");
	});
});

describe("handleSearch", () => {
	it("returns 200 and sends usage hint when keyword is missing", async () => {
		const response = await handleSearch(sql, 42, token, "");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use: /search <keyword>");
		expect(mockSearchExpenses).not.toHaveBeenCalled();
	});

	it("sends 'no expenses found' message when there are no matches", async () => {
		mockSearchExpenses.mockResolvedValue([]);

		await handleSearch(sql, 42, token, "xyz");

		expect(mockSearchExpenses).toHaveBeenCalledWith(sql, 42, "xyz");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, 'No expenses found for "xyz".');
	});

	it("sends formatted table with matching expenses", async () => {
		mockSearchExpenses.mockResolvedValue([
			{ id: 1, amount: 300, category: "gym", note: "bought shoes", expense_date: "2026-06-10" },
			{ id: 2, amount: 50, category: "gym", note: null, expense_date: "2026-06-01" },
		]);

		await handleSearch(sql, 42, token, "gym");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("#1");
		expect(sent).toContain("gym");
		expect(sent).toContain("bought shoes");
		expect(sent).toContain("ID    Date        Amount    Category      Note");
	});

	it("returns the matched rows in the response body", async () => {
		const rows = [{ id: 1, amount: 300, category: "gym", note: "", expense_date: "2026-06-10" }];
		mockSearchExpenses.mockResolvedValue(rows);

		const response = await handleSearch(sql, 42, token, "gym");
		const body = await response.json() as { ok: boolean; rows: unknown[] };

		expect(body.ok).toBe(true);
		expect(body.rows).toEqual(rows);
	});

	it("returns 200 and logs when searchExpenses throws", async () => {
		mockSearchExpenses.mockRejectedValue(new Error("DB error"));

		const response = await handleSearch(sql, 42, token, "gym");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
	});
});

describe("handleTop", () => {
	it("defaults to limit 10 with no args", async () => {
		await handleTop(sql, 42, token, "");

		expect(mockFetchTopExpenses).toHaveBeenCalledWith(sql, 42, 10, undefined);
	});

	it("parses N from the first token when it is a number", async () => {
		await handleTop(sql, 42, token, "5");

		expect(mockFetchTopExpenses).toHaveBeenCalledWith(sql, 42, 5, undefined);
	});

	it("treats first token as filter when it matches date pattern", async () => {
		await handleTop(sql, 42, token, "2026-05");

		expect(mockFetchTopExpenses).toHaveBeenCalledWith(sql, 42, 10, "2026-05");
	});

	it("parses N and filter when both are provided", async () => {
		await handleTop(sql, 42, token, "5 2026-05");

		expect(mockFetchTopExpenses).toHaveBeenCalledWith(sql, 42, 5, "2026-05");
	});

	it("sends a formatted table when rows exist", async () => {
		mockFetchTopExpenses.mockResolvedValue([
			{ id: 42, amount: "300.00", category: "gym", note: "bought shoes", expense_date: "2026-06-17" },
			{ id: 18, amount: "250.00", category: "groceries", note: "", expense_date: "2026-05-10" },
		]);

		await handleTop(sql, 42, token, "");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("ID    Date        Amount    Category      Note");
		expect(sent).toContain("#42");
		expect(sent).toContain("gym");
		expect(sent).toContain("bought shoes");
	});

	it("sends 'No expenses found.' when there are no results", async () => {
		await handleTop(sql, 42, token, "");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No expenses found.");
	});

	it("clamps N to 1 when 0 is given", async () => {
		await handleTop(sql, 42, token, "0");

		expect(mockFetchTopExpenses).toHaveBeenCalledWith(sql, 42, 1, undefined);
	});

	it("returns 200 and logs when fetchTopExpenses throws", async () => {
		mockFetchTopExpenses.mockRejectedValue(new Error("DB error"));

		const response = await handleTop(sql, 42, token, "");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
	});
});
