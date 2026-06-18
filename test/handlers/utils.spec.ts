import { describe, it, expect } from "vitest";
import { parseExpense } from "../../src/handlers/utils";

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
