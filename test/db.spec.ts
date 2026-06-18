import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReport, fetchRecent, fetchCategoryTotals, saveExpense, migrate, saveLog, fetchLogs, deleteExpense } from "../src/db";
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
		it("calls sql twice (upsert category + insert) and returns nothing", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([]);

			const result = await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			expect(mockSql).toHaveBeenCalledTimes(2);
			expect(result).toBeUndefined();
		});

		it("scopes category upsert to the user's telegram_user_id", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([]);

			await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			// First call is the category upsert; interpolated values are (telegramUserId, name)
			const [, telegramUserId, categoryName] = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(telegramUserId).toBe(42);
			expect(categoryName).toBe("gym");
		});

		it("uses ON CONFLICT (telegram_user_id, name) to prevent duplicate categories per user", async () => {
			(mockSql as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([]);

			await saveExpense(mockSql, 42, { amount: 300, category: "gym", note: "", expenseDate: "2026-06-10" });

			// First call is the category upsert; string parts joined reveal the ON CONFLICT clause
			const sqlStrings = (mockSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
			expect(sqlStrings.join("")).toContain("ON CONFLICT (telegram_user_id, name)");
		});
	});

	describe("migrate", () => {
		it("creates the categories, expenses, and logs tables", async () => {
			await migrate(mockSql);

			expect(mockSql).toHaveBeenCalledTimes(3);
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
});
