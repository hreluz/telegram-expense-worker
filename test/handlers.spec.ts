import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseExpense, handleReport, handleList, handleAddExpense } from "../src/handlers";
import type { Sql } from "../src/types";

const { mockFetchReport, mockFetchRecent, mockSaveExpense } = vi.hoisted(() => ({
	mockFetchReport: vi.fn().mockResolvedValue([]),
	mockFetchRecent: vi.fn().mockResolvedValue([]),
	mockSaveExpense: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db", () => ({
	fetchReport: mockFetchReport,
	fetchRecent: mockFetchRecent,
	saveExpense: mockSaveExpense,
}));

// sql is fully delegated to the db mocks, so a placeholder is fine here
const sql = {} as unknown as Sql;

beforeEach(() => {
	mockFetchReport.mockResolvedValue([]);
	mockFetchRecent.mockResolvedValue([]);
	mockSaveExpense.mockResolvedValue(undefined);
});

describe("parseExpense", () => {
	it("parses amount and category", () => {
		expect(parseExpense("300 gym")).toEqual({ amount: 300, category: "gym", note: "" });
	});

	it("parses a multi-word note", () => {
		expect(parseExpense("50 food pizza night out")).toEqual({
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
});

describe("handleReport", () => {

	it("returns only header when there are no expenses", async () => {
		const response = await handleReport(sql, 42);
		const body = await response.json() as { ok: boolean; csv: string };

		expect(body.ok).toBe(true);
		expect(body.csv).toBe("date,amount,category,note");
	});

	it("builds CSV rows from expenses", async () => {
		mockFetchReport.mockResolvedValue([
			{ created_at: "2026-01-01", amount: 100, category: "food", note: "lunch" },
			{ created_at: "2026-01-02", amount: 50, category: "gym", note: null },
		]);

		const response = await handleReport(sql, 42);
		const body = await response.json() as { csv: string };

		expect(body.csv).toBe(
			"date,amount,category,note\n2026-01-01,100,food,lunch\n2026-01-02,50,gym,"
		);
	});
});

describe("handleList", () => {

	it("returns rows", async () => {
		const rows = [{ amount: 200, category: "transport", note: "taxi", created_at: "2026-01-01" }];
		mockFetchRecent.mockResolvedValue(rows);

		const response = await handleList(sql, 42);
		const body = await response.json() as { ok: boolean; rows: unknown[] };

		expect(body.ok).toBe(true);
		expect(body.rows).toEqual(rows);
	});

	it("returns empty array when no expenses", async () => {
		const response = await handleList(sql, 42);
		const body = await response.json() as { rows: unknown[] };

		expect(body.rows).toEqual([]);
	});
});

describe("handleAddExpense", () => {

	it("saves the expense and returns it", async () => {
		const response = await handleAddExpense(sql, 42, "300 gym");
		const body = await response.json() as { ok: boolean; message: string; expense: object };

		expect(body.ok).toBe(true);
		expect(body.message).toBe("Saved");
		expect(body.expense).toMatchObject({ amount: 300, category: "gym", note: "" });
		expect(mockSaveExpense).toHaveBeenCalledWith(sql, 42, { amount: 300, category: "gym", note: "" });
	});

	it("returns 400 when parsing fails", async () => {
		const response = await handleAddExpense(sql, 42, "300");

		expect(response.status).toBe(400);
		const body = await response.json() as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect(body.error).toBe("Use format: 300 gym");
	});

	it("returns 400 when the db throws", async () => {
		mockSaveExpense.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleAddExpense(sql, 42, "300 gym");

		expect(response.status).toBe(400);
		const body = await response.json() as { error: string };
		expect(body.error).toBe("DB connection failed");
	});
});
