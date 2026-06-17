import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReport, fetchRecent, saveExpense, migrate, saveLog, fetchLogs } from "../src/db";
import type { Sql } from "../src/types";

describe("db", () => {
	const mockSql = vi.fn() as unknown as Sql;

	beforeEach(() => {
		vi.clearAllMocks();
		(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue([]);
	});

	describe("fetchReport", () => {
		it("returns rows from sql", async () => {
			const rows = [{ created_at: "2026-01-01", amount: 100, category: "food", note: "lunch" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchReport(mockSql, 42);

			expect(result).toEqual(rows);
			expect(mockSql).toHaveBeenCalledOnce();
		});
	});

	describe("fetchRecent", () => {
		it("returns rows from sql", async () => {
			const rows = [{ amount: 50, category: "gym", note: null, created_at: "2026-01-01" }];
			(mockSql as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

			const result = await fetchRecent(mockSql, 42);

			expect(result).toEqual(rows);
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
});
