import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleReport, handleList, handleAddExpense, handleHelp, handleDelete, handleSummary, handleUndo, handleBudget, handleSearch, handleCallbackQuery, handleRename, HELP_TEXT } from "../src/handlers";
import type { Sql } from "../src/types";

const { mockFetchReport, mockFetchRecent, mockFetchCategoryTotals, mockSaveExpense, mockSaveLog, mockDeleteExpense, mockFetchBiggestExpense, mockDeleteLatestExpense, mockSetBudget, mockRemoveBudget, mockFetchBudgets, mockFetchBudgetForCategory, mockSearchExpenses, mockRenameCategory, mockSendTelegramMessage, mockSendTelegramDocument, mockAnswerCallbackQuery, mockEditMessageReplyMarkup } = vi.hoisted(() => ({
	mockFetchReport: vi.fn().mockResolvedValue([]),
	mockFetchRecent: vi.fn().mockResolvedValue([]),
	mockFetchCategoryTotals: vi.fn().mockResolvedValue([]),
	mockSaveExpense: vi.fn().mockResolvedValue(undefined),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockDeleteExpense: vi.fn().mockResolvedValue({ found: true, categoryDeleted: false }),
	mockFetchBiggestExpense: vi.fn().mockResolvedValue([]),
	mockDeleteLatestExpense: vi.fn().mockResolvedValue({ found: true, categoryDeleted: false, expense: { id: 1, amount: 300, category: 'gym', expense_date: '2026-06-17' } }),
	mockSetBudget: vi.fn().mockResolvedValue(undefined),
	mockRemoveBudget: vi.fn().mockResolvedValue(true),
	mockFetchBudgets: vi.fn().mockResolvedValue([]),
	mockFetchBudgetForCategory: vi.fn().mockResolvedValue([]),
	mockSearchExpenses: vi.fn().mockResolvedValue([]),
	mockRenameCategory: vi.fn().mockResolvedValue({ found: true, count: 3 }),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramDocument: vi.fn().mockResolvedValue(undefined),
	mockAnswerCallbackQuery: vi.fn().mockResolvedValue(undefined),
	mockEditMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db", () => ({
	fetchReport: mockFetchReport,
	fetchRecent: mockFetchRecent,
	fetchCategoryTotals: mockFetchCategoryTotals,
	saveExpense: mockSaveExpense,
	saveLog: mockSaveLog,
	deleteExpense: mockDeleteExpense,
	fetchBiggestExpense: mockFetchBiggestExpense,
	deleteLatestExpense: mockDeleteLatestExpense,
	setBudget: mockSetBudget,
	removeBudget: mockRemoveBudget,
	fetchBudgets: mockFetchBudgets,
	fetchBudgetForCategory: mockFetchBudgetForCategory,
	searchExpenses: mockSearchExpenses,
	renameCategory: mockRenameCategory,
}));

vi.mock("../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	sendTelegramDocument: mockSendTelegramDocument,
	answerCallbackQuery: mockAnswerCallbackQuery,
	editMessageReplyMarkup: mockEditMessageReplyMarkup,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchReport.mockResolvedValue([]);
	mockFetchRecent.mockResolvedValue([]);
	mockFetchCategoryTotals.mockResolvedValue([]);
	mockSaveExpense.mockResolvedValue(99);
	mockSaveLog.mockResolvedValue(undefined);
	mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });
	mockFetchBiggestExpense.mockResolvedValue([]);
	mockDeleteLatestExpense.mockResolvedValue({ found: true, categoryDeleted: false, expense: { id: 1, amount: 300, category: 'gym', expense_date: '2026-06-17' } });
	mockSetBudget.mockResolvedValue(undefined);
	mockRemoveBudget.mockResolvedValue(true);
	mockFetchBudgets.mockResolvedValue([]);
	mockFetchBudgetForCategory.mockResolvedValue([]);
	mockSearchExpenses.mockResolvedValue([]);
	mockRenameCategory.mockResolvedValue({ found: true, count: 3 });
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockSendTelegramDocument.mockResolvedValue(undefined);
	mockAnswerCallbackQuery.mockResolvedValue(undefined);
	mockEditMessageReplyMarkup.mockResolvedValue(undefined);
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

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(
			token, 42,
			expect.stringMatching(/^Saved: 300 gym\nDate: \d{4}-\d{2}-\d{2}$/),
			undefined,
			expect.objectContaining({ inline_keyboard: [[{ text: '🗑 Undo', callback_data: 'undo_99' }]] }),
		);
	});

	it("includes note in confirmation when present", async () => {
		await handleAddExpense(sql, 42, "300 gym bought shoes", token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(
			token, 42,
			expect.stringMatching(/^Saved: 300 gym\nDate: \d{4}-\d{2}-\d{2}\nNote: bought shoes$/),
			undefined,
			expect.objectContaining({ inline_keyboard: [[{ text: '🗑 Undo', callback_data: 'undo_99' }]] }),
		);
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

	it("appends over-budget warning when category exceeds its monthly budget", async () => {
		mockFetchBudgetForCategory.mockResolvedValue([{ amount: "200.00" }]);
		mockFetchCategoryTotals.mockResolvedValue([{ category: "gym", total: "350.00" }]);

		await handleAddExpense(sql, 42, "300 gym", token);

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("Warning: gym is over budget (150.00 over this month)");
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

	it("returns 200 and sends the error message when deleteExpense throws", async () => {
		mockDeleteExpense.mockRejectedValue(new Error("DB error"));

		const response = await handleDelete(sql, 42, token, "5");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
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

	it("shows budget alongside category total when a budget is set", async () => {
		mockFetchCategoryTotals
			.mockResolvedValueOnce([{ category: "gym", total: "450.00" }])
			.mockResolvedValueOnce([]);
		mockFetchBiggestExpense.mockResolvedValue([]);
		mockFetchBudgets.mockResolvedValue([{ category: "gym", amount: "500.00" }]);

		await handleSummary(sql, 42, token);

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("450.00 / 500.00");
	});

	it("shows over-budget warning and marker when category exceeds budget", async () => {
		mockFetchCategoryTotals
			.mockResolvedValueOnce([{ category: "groceries", total: "380.00" }])
			.mockResolvedValueOnce([]);
		mockFetchBiggestExpense.mockResolvedValue([]);
		mockFetchBudgets.mockResolvedValue([{ category: "groceries", amount: "300.00" }]);

		await handleSummary(sql, 42, token);

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("Warning: groceries is over budget (80.00 over)");
		expect(sent).toContain("[over by 80.00]");
	});

	it("returns 200 and sends the error message when db throws", async () => {
		mockFetchCategoryTotals.mockRejectedValue(new Error("DB down"));

		const response = await handleSummary(sql, 42, token);

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB down");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB down");
	});
});

describe("handleUndo", () => {
	it("deletes the latest expense and sends confirmation", async () => {
		mockDeleteLatestExpense.mockResolvedValue({ found: true, categoryDeleted: false, expense: { id: 5, amount: 300, category: 'gym', expense_date: '2026-06-17' } });

		const response = await handleUndo(sql, 42, token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockDeleteLatestExpense).toHaveBeenCalledWith(sql, 42);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Undone: 300.00 gym (2026-06-17).");
	});

	it("sends 'No expenses to undo.' when there are no expenses", async () => {
		mockDeleteLatestExpense.mockResolvedValue({ found: false, categoryDeleted: false });

		const response = await handleUndo(sql, 42, token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No expenses to undo.");
	});

	it("returns 200 and sends the error message when deleteLatestExpense throws", async () => {
		mockDeleteLatestExpense.mockRejectedValue(new Error("DB error"));

		const response = await handleUndo(sql, 42, token);

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
	});
});

describe("handleBudget", () => {
	it("sets a budget and sends confirmation", async () => {
		const response = await handleBudget(sql, 42, token, "gym 500");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockSetBudget).toHaveBeenCalledWith(sql, 42, "gym", 500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Budget set: gym  500.00/month");
	});

	it("lowercases the category when setting a budget", async () => {
		await handleBudget(sql, 42, token, "GYM 500");

		expect(mockSetBudget).toHaveBeenCalledWith(sql, 42, "gym", 500);
	});

	it("removes an existing budget and sends confirmation", async () => {
		mockRemoveBudget.mockResolvedValue(true);

		const response = await handleBudget(sql, 42, token, "gym off");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockRemoveBudget).toHaveBeenCalledWith(sql, 42, "gym");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Budget removed: gym");
	});

	it("returns 200 and sends message when no budget exists to remove", async () => {
		mockRemoveBudget.mockResolvedValue(false);

		const response = await handleBudget(sql, 42, token, "gym off");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No budget set for gym.");
	});

	it("lists all budgets when called with no arguments", async () => {
		mockFetchBudgets.mockResolvedValue([
			{ category: "gym", amount: "500.00" },
			{ category: "groceries", amount: "300.00" },
		]);

		await handleBudget(sql, 42, token, "");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("Budgets:");
		expect(sent).toContain("gym");
		expect(sent).toContain("500.00");
		expect(sent).toContain("groceries");
	});

	it("sends 'No budgets set.' when there are no budgets", async () => {
		mockFetchBudgets.mockResolvedValue([]);

		await handleBudget(sql, 42, token, "");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No budgets set.");
	});

	it("returns 200 and sends usage hint when amount is invalid", async () => {
		const response = await handleBudget(sql, 42, token, "gym abc");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, expect.stringContaining("Use: /budget"));
		expect(mockSetBudget).not.toHaveBeenCalled();
	});

	it("returns 200 and sends usage hint when amount is zero", async () => {
		const response = await handleBudget(sql, 42, token, "gym 0");

		expect(response.status).toBe(200);
		expect(mockSetBudget).not.toHaveBeenCalled();
	});

	it("returns 200 and sends the error message when setBudget throws", async () => {
		mockSetBudget.mockRejectedValue(new Error("DB error"));

		const response = await handleBudget(sql, 42, token, "gym 500");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
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

const makeCallbackQuery = (data: string, userId = 42, messageId = 100) => ({
	id: 'cq_123',
	from: { id: userId },
	message: { message_id: messageId, chat: { id: userId } },
	data,
});

describe("handleCallbackQuery", () => {
	it("deletes the expense and sends confirmation when undo button is tapped", async () => {
		mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });

		const response = await handleCallbackQuery(sql, makeCallbackQuery('undo_10'), token);
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockDeleteExpense).toHaveBeenCalledWith(sql, 42, 10);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, 'Expense #10 deleted.');
	});

	it("sends 'Expense not found.' when the expense was already deleted", async () => {
		mockDeleteExpense.mockResolvedValue({ found: false, categoryDeleted: false });

		await handleCallbackQuery(sql, makeCallbackQuery('undo_10'), token);

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, 'Expense not found.');
	});

	it("answers the callback query and removes the keyboard after undo", async () => {
		mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });

		await handleCallbackQuery(sql, makeCallbackQuery('undo_10'), token);

		expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(token, 'cq_123');
		expect(mockEditMessageReplyMarkup).toHaveBeenCalledWith(token, 42, 100, {});
	});

	it("answers the callback query silently for unknown data", async () => {
		await handleCallbackQuery(sql, makeCallbackQuery('unknown_action'), token);

		expect(mockDeleteExpense).not.toHaveBeenCalled();
		expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(token, 'cq_123');
	});

	it("still answers the callback and removes keyboard when deleteExpense throws", async () => {
		mockDeleteExpense.mockRejectedValue(new Error("DB error"));

		await handleCallbackQuery(sql, makeCallbackQuery('undo_10'), token);

		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(token, 'cq_123');
		expect(mockEditMessageReplyMarkup).toHaveBeenCalledWith(token, 42, 100, {});
	});
});

describe("handleRename", () => {
	it("renames a category and sends confirmation", async () => {
		mockRenameCategory.mockResolvedValue({ found: true, count: 3 });

		const response = await handleRename(sql, 42, token, "coffee cafe");
		const body = await response.json() as { ok: boolean; count: number };

		expect(body.ok).toBe(true);
		expect(body.count).toBe(3);
		expect(mockRenameCategory).toHaveBeenCalledWith(sql, 42, "coffee", "cafe");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Renamed coffee → cafe. 3 expenses updated.");
	});

	it("uses singular 'expense' when count is 1", async () => {
		mockRenameCategory.mockResolvedValue({ found: true, count: 1 });

		await handleRename(sql, 42, token, "coffee cafe");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Renamed coffee → cafe. 1 expense updated.");
	});

	it("lowercases both names before calling renameCategory", async () => {
		await handleRename(sql, 42, token, "COFFEE CAFE");

		expect(mockRenameCategory).toHaveBeenCalledWith(sql, 42, "coffee", "cafe");
	});

	it("sends usage hint when no args are given", async () => {
		const response = await handleRename(sql, 42, token, "");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use: /rename <old> <new>");
		expect(mockRenameCategory).not.toHaveBeenCalled();
	});

	it("sends usage hint when only one arg is given", async () => {
		const response = await handleRename(sql, 42, token, "coffee");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use: /rename <old> <new>");
		expect(mockRenameCategory).not.toHaveBeenCalled();
	});

	it("sends error when old and new names are the same", async () => {
		const response = await handleRename(sql, 42, token, "gym gym");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Old and new category names are the same.");
		expect(mockRenameCategory).not.toHaveBeenCalled();
	});

	it("sends 'Category not found.' when old category does not exist", async () => {
		mockRenameCategory.mockResolvedValue({ found: false, count: 0 });

		const response = await handleRename(sql, 42, token, "xyz cafe");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Category 'xyz' not found.");
	});

	it("logs and sends error when renameCategory throws", async () => {
		mockRenameCategory.mockRejectedValue(new Error("DB error"));

		const response = await handleRename(sql, 42, token, "coffee cafe");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
	});
});
