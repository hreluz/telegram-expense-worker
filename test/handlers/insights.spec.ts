import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSummary, handleCompare } from "../../src/handlers/insights";
import type { Sql } from "../../src/types";

const { mockFetchCategoryTotals, mockSaveLog, mockFetchBiggestExpense, mockFetchBudgets, mockFetchPeriodSummary, mockCategoryExists, mockSendTelegramMessage } = vi.hoisted(() => ({
	mockFetchCategoryTotals: vi.fn().mockResolvedValue([]),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockFetchBiggestExpense: vi.fn().mockResolvedValue([]),
	mockFetchBudgets: vi.fn().mockResolvedValue([]),
	mockFetchPeriodSummary: vi.fn().mockResolvedValue({ total: 0, count: 0, biggest: 0 }),
	mockCategoryExists: vi.fn().mockResolvedValue(true),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	fetchCategoryTotals: mockFetchCategoryTotals,
	saveLog: mockSaveLog,
	fetchBiggestExpense: mockFetchBiggestExpense,
	fetchBudgets: mockFetchBudgets,
	fetchPeriodSummary: mockFetchPeriodSummary,
	categoryExists: mockCategoryExists,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockFetchCategoryTotals.mockResolvedValue([]);
	mockSaveLog.mockResolvedValue(undefined);
	mockFetchBiggestExpense.mockResolvedValue([]);
	mockFetchBudgets.mockResolvedValue([]);
	mockFetchPeriodSummary.mockResolvedValue({ total: 0, count: 0, biggest: 0 });
	mockCategoryExists.mockResolvedValue(true);
	mockSendTelegramMessage.mockResolvedValue(undefined);
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

describe("handleCompare", () => {
	it("defaults to current month vs previous month when no args", async () => {
		await handleCompare(sql, 42, token, "");

		expect(mockFetchPeriodSummary).toHaveBeenCalledTimes(2);
		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, expect.any(String), undefined);
	});

	it("parses category and two periods", async () => {
		await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-04", "gym");
		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-05", "gym");
	});

	it("defaults period2 to previous month when only period1 given", async () => {
		await handleCompare(sql, 42, token, "gym 2026-05");

		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-05", "gym");
		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-04", "gym");
	});

	it("treats first token as period1 when it matches date pattern (no category)", async () => {
		await handleCompare(sql, 42, token, "2026-04 2026-05");

		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-04", undefined);
		expect(mockFetchPeriodSummary).toHaveBeenCalledWith(sql, 42, "2026-05", undefined);
	});

	it("sends formatted table with totals and change calculation", async () => {
		mockFetchPeriodSummary
			.mockResolvedValueOnce({ total: 300, count: 3, biggest: 150 })
			.mockResolvedValueOnce({ total: 450, count: 5, biggest: 200 });

		await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("gym");
		expect(sent).toContain("300.00");
		expect(sent).toContain("450.00");
		expect(sent).toContain("+150.00");
		expect(sent).toContain("+50%");
	});

	it("shows zero values when no expenses exist in a period", async () => {
		await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("0.00");
	});

	it("shows — for change when period1 total is zero", async () => {
		mockFetchPeriodSummary
			.mockResolvedValueOnce({ total: 0, count: 0, biggest: 0 })
			.mockResolvedValueOnce({ total: 0, count: 0, biggest: 0 });

		await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		const sent = mockSendTelegramMessage.mock.calls[0][2] as string;
		expect(sent).toContain("—");
	});

	it("sends 'Category not found.' when the category does not exist", async () => {
		mockCategoryExists.mockResolvedValue(false);

		const response = await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		const body = await response.json() as { ok: boolean };
		expect(body.ok).toBe(false);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Category 'gym' not found.");
		expect(mockFetchPeriodSummary).not.toHaveBeenCalled();
	});

	it("skips category check when no category given", async () => {
		await handleCompare(sql, 42, token, "2026-04 2026-05");

		expect(mockCategoryExists).not.toHaveBeenCalled();
	});

	it("returns 200 and logs when fetchPeriodSummary throws", async () => {
		mockFetchPeriodSummary.mockRejectedValue(new Error("DB error"));

		const response = await handleCompare(sql, 42, token, "gym 2026-04 2026-05");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "DB error");
	});
});
