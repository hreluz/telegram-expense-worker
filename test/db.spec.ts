import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReport, fetchRecent, fetchCategoryTotals, categoryExists, saveExpense, migrate, saveLog, fetchLogs, deleteExpense, updateExpenseNote, fetchBiggestExpense, fetchTopExpenses, fetchPeriodSummary, deleteLatestExpense, setBudget, removeBudget, fetchBudgets, fetchBudgetForCategory, searchExpenses, renameCategory } from "../src/db";
import type { Sql } from "../src/types";

describe("db", () => {
	const mockSql = vi.fn() as unknown as Sql;

	beforeEach(() => {
		vi.clearAllMocks();
		(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([]);
	});

	describe("fetchReport", () => {
		it("returns rows from sql with no filter", async () => {
			const rows = [{ created_at: "2026-01-01", amount: 100, category: "food", note: "lunch" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchReport(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with year filter", async () => {
			await fetchReport(mockSql, 42, "2026");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with month filter", async () => {
			await fetchReport(mockSql, 42, "2026-05");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with day filter", async () => {
			await fetchReport(mockSql, 42, "2026-05-01");

			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchRecent", () => {
		it("returns rows from sql with no filter", async () => {
			const rows = [{ amount: 50, category: "gym", note: null, created_at: "2026-01-01" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchRecent(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with year filter", async () => {
			await fetchRecent(mockSql, 42, "2026");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with month filter", async () => {
			await fetchRecent(mockSql, 42, "2026-05");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with day filter", async () => {
			await fetchRecent(mockSql, 42, "2026-05-01");

			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("saveExpense", () => {
		it("calls sql twice (upsert category + insert) and returns the new expense id", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([{ id: 99 }]);

			const result = await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			expect(mockSql).toHaveBeenCalledTimes(2);
			expect(result).toBe(99);
		});

		it("scopes category upsert to the user's telegram_user_id", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([{ id: 99 }]);

			await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			// First call is the category upsert; interpolated values are (telegramUserId, name)
			const [, telegramUserId, categoryName] = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(telegramUserId).toBe(42);
			expect(categoryName).toBe("gym");
		});

		it("uses ON CONFLICT (telegram_user_id, name) to prevent duplicate categories per user", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([{ id: 99 }]);

			await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			// First call is the category upsert; string parts joined reveal the ON CONFLICT clause
			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("ON CONFLICT (telegram_user_id, name)");
		});
	});

	describe("migrate", () => {
		it("creates the categories, expenses, logs, and budgets tables", async () => {
			await migrate(mockSql);

			expect(mockSql).toHaveBeenCalledTimes(4);
		});
	});

	describe("saveLog", () => {
		it("calls sql and returns nothing", async () => {
			const result = await saveLog(mockSql, 42, "Something went wrong");

			expect(mockSql).toHaveBeenCalledOnce();
			expect(result).toBeUndefined();
		});
	});

	describe("fetchLogs", () => {
		it("returns rows from sql", async () => {
			const rows = [{ message: "DB connection failed", created_at: "2026-01-01T10:00:00Z" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchLogs(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchTopExpenses", () => {
		it("returns rows ordered by amount with no filter", async () => {
			const rows = [
				{ id: 1, amount: 300, category: "gym", note: "", expense_date: "2026-06-10" },
				{ id: 2, amount: 100, category: "food", note: "", expense_date: "2026-06-01" },
			];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchTopExpenses(mockSql, 42, 10);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with filter pattern when filter is provided", async () => {
			await fetchTopExpenses(mockSql, 42, 5, "2026-05");

			expect(mockSql).toHaveBeenCalledOnce();
			const [, , pattern] = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(pattern).toBe("2026-05%");
		});

		it("passes limit to sql", async () => {
			await fetchTopExpenses(mockSql, 42, 3);

			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("LIMIT");
		});
	});

	describe("updateExpenseNote", () => {
		it("returns true when the expense is found and updated", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 10 }]);

			const result = await updateExpenseNote(mockSql, 42, 10, "bought new shoes");

			expect(result).toBe(true);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns false when the expense is not found", async () => {
			const result = await updateExpenseNote(mockSql, 42, 99, "some note");

			expect(result).toBe(false);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("uses RETURNING so the found check is accurate", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 10 }]);

			await updateExpenseNote(mockSql, 42, 10, "note");

			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("RETURNING");
		});
	});

	describe("fetchBiggestExpense", () => {
		it("returns the row from sql", async () => {
			const rows = [{ id: 42, amount: 300, category: "gym", note: "bought shoes", expense_date: "2026-06-10" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchBiggestExpense(mockSql, 42, "2026-06");

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns empty array when no expenses match the filter", async () => {
			const result = await fetchBiggestExpense(mockSql, 42, "2026-06");

			expect(result).toEqual([]);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("deleteLatestExpense", () => {
		it("returns { found: false } when no expenses exist", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

			const result = await deleteLatestExpense(mockSql, 42);

			expect(result).toEqual({ found: false, categoryDeleted: false });
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns { found: true, categoryDeleted: false } when category still has other expenses", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 10, amount: 300, category_id: 7, expense_date: "2026-06-17" }])
				.mockResolvedValueOnce([{ name: "gym" }])
				.mockResolvedValueOnce([{ count: 2 }]);

			const result = await deleteLatestExpense(mockSql, 42);

			expect(result).toEqual({ found: true, categoryDeleted: false, expense: { id: 10, amount: 300, category: "gym", expense_date: "2026-06-17" } });
			expect(mockSql).toHaveBeenCalledTimes(3);
		});

		it("returns { found: true, categoryDeleted: true } and deletes category when last expense is removed", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 10, amount: 300, category_id: 7, expense_date: "2026-06-17" }])
				.mockResolvedValueOnce([{ name: "gym" }])
				.mockResolvedValueOnce([{ count: 0 }])
				.mockResolvedValueOnce([]);

			const result = await deleteLatestExpense(mockSql, 42);

			expect(result).toEqual({ found: true, categoryDeleted: true, expense: { id: 10, amount: 300, category: "gym", expense_date: "2026-06-17" } });
			expect(mockSql).toHaveBeenCalledTimes(4);
		});
	});

	describe("deleteExpense", () => {
		it("returns { found: false } when no expense matches", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

			const result = await deleteExpense(mockSql, 42, 99);

			expect(result).toEqual({ found: false, categoryDeleted: false });
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns { found: true, categoryDeleted: false } when category still has other expenses", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ category_id: 7 }])
				.mockResolvedValueOnce([{ count: 2 }]);

			const result = await deleteExpense(mockSql, 42, 10);

			expect(result).toEqual({ found: true, categoryDeleted: false });
			expect(mockSql).toHaveBeenCalledTimes(2);
		});

		it("returns { found: true, categoryDeleted: true } and deletes category when last expense is removed", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ category_id: 7 }])
				.mockResolvedValueOnce([{ count: 0 }])
				.mockResolvedValueOnce([]);

			const result = await deleteExpense(mockSql, 42, 10);

			expect(result).toEqual({ found: true, categoryDeleted: true });
			expect(mockSql).toHaveBeenCalledTimes(3);
		});
	});

	describe("setBudget", () => {
		it("calls sql once to upsert the budget", async () => {
			await setBudget(mockSql, 42, "gym", 500);

			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("removeBudget", () => {
		it("returns true when the budget is deleted", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 1 }]);

			const result = await removeBudget(mockSql, 42, "gym");

			expect(result).toBe(true);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns false when no budget exists for that category", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

			const result = await removeBudget(mockSql, 42, "gym");

			expect(result).toBe(false);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchBudgets", () => {
		it("returns rows from sql", async () => {
			const rows = [{ category: "gym", amount: "500.00" }, { category: "groceries", amount: "300.00" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchBudgets(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchBudgetForCategory", () => {
		it("returns the budget row for the matching category", async () => {
			const rows = [{ amount: "500.00" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchBudgetForCategory(mockSql, 42, "gym");

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns empty array when no budget is set for the category", async () => {
			const result = await fetchBudgetForCategory(mockSql, 42, "gym");

			expect(result).toEqual([]);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("searchExpenses", () => {
		it("returns matching rows from sql", async () => {
			const rows = [{ id: 1, amount: 300, category: "gym", note: "bought shoes", expense_date: "2026-06-10" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await searchExpenses(mockSql, 42, "gym");

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns empty array when no expenses match", async () => {
			const result = await searchExpenses(mockSql, 42, "xyz");

			expect(result).toEqual([]);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("uses ILIKE for case-insensitive matching", async () => {
			await searchExpenses(mockSql, 42, "GYM");

			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("ILIKE");
		});
	});

	describe("renameCategory", () => {
		it("returns { found: false } when old category does not exist", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

			const result = await renameCategory(mockSql, 42, "coffee", "cafe");

			expect(result).toEqual({ found: false, count: 0 });
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns { found: true, count: N } and makes 4 sql calls on success", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])   // SELECT old category
				.mockResolvedValueOnce([{ id: 2 }])   // INSERT/upsert new category
				.mockResolvedValueOnce([{}, {}])       // UPDATE expenses (2 rows)
				.mockResolvedValueOnce([]);             // DELETE old category

			const result = await renameCategory(mockSql, 42, "coffee", "cafe");

			expect(result).toEqual({ found: true, count: 2 });
			expect(mockSql).toHaveBeenCalledTimes(4);
		});

		it("resolves to the existing category id when new name already exists", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])   // SELECT old category
				.mockResolvedValueOnce([{ id: 3 }])   // upsert returns existing id
				.mockResolvedValueOnce([{ id: 10 }])  // UPDATE expenses RETURNING id
				.mockResolvedValueOnce([]);             // DELETE old category

			const result = await renameCategory(mockSql, 42, "coffee", "cafe");

			expect(result).toEqual({ found: true, count: 1 });
		});

		it("uses RETURNING on the UPDATE so the count reflects actual rows moved", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([{ id: 2 }])
				.mockResolvedValueOnce([{ id: 10 }, { id: 11 }])
				.mockResolvedValueOnce([]);

			await renameCategory(mockSql, 42, "gymm", "gym");

			const updateCall = (mockSql as ReturnType<typeof vi.fn>).mock.calls[2];
			const sqlStrings = updateCall[0] as string[];
			expect(sqlStrings.join("")).toContain("RETURNING");
		});
	});

	describe("categoryExists", () => {
		it("returns true when the category exists", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ 1: 1 }]);

			const result = await categoryExists(mockSql, 42, "gym");

			expect(result).toBe(true);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns false when the category does not exist", async () => {
			const result = await categoryExists(mockSql, 42, "gym");

			expect(result).toBe(false);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchCategoryTotals", () => {
		it("returns rows from sql with no filter", async () => {
			const rows = [{ category: "gym", total: 500 }, { category: "food", total: 200 }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchCategoryTotals(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with year filter", async () => {
			await fetchCategoryTotals(mockSql, 42, "2026");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with month filter", async () => {
			await fetchCategoryTotals(mockSql, 42, "2026-05");

			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("calls sql with day filter", async () => {
			await fetchCategoryTotals(mockSql, 42, "2026-05-01");

			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchPeriodSummary", () => {
		it("returns total, count, and biggest with no category filter", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: 750, count: 5, biggest: 300 }]);

			const result = await fetchPeriodSummary(mockSql, 42, "2026-05");

			expect(result).toEqual({ total: 750, count: 5, biggest: 300 });
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns total, count, and biggest with category filter", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: 300, count: 3, biggest: 150 }]);

			const result = await fetchPeriodSummary(mockSql, 42, "2026-05", "gym");

			expect(result).toEqual({ total: 300, count: 3, biggest: 150 });
			expect(mockSql).toHaveBeenCalledOnce();
		});

		it("returns zeros when no expenses exist in the period", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: 0, count: 0, biggest: 0 }]);

			const result = await fetchPeriodSummary(mockSql, 42, "2026-01");

			expect(result).toEqual({ total: 0, count: 0, biggest: 0 });
		});

		it("includes AND c.name filter when category is given", async () => {
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([{ total: 0, count: 0, biggest: 0 }]);

			await fetchPeriodSummary(mockSql, 42, "2026-05", "gym");

			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("c.name");
		});
	});
});
