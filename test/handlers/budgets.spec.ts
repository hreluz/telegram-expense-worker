import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleBudget } from "../../src/handlers/budgets";
import type { Sql } from "../../src/types";

const { mockSetBudget, mockRemoveBudget, mockFetchBudgets, mockSaveLog, mockSendTelegramMessage } = vi.hoisted(() => ({
	mockSetBudget: vi.fn().mockResolvedValue(undefined),
	mockRemoveBudget: vi.fn().mockResolvedValue(true),
	mockFetchBudgets: vi.fn().mockResolvedValue([]),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	setBudget: mockSetBudget,
	removeBudget: mockRemoveBudget,
	fetchBudgets: mockFetchBudgets,
	saveLog: mockSaveLog,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockSetBudget.mockResolvedValue(undefined);
	mockRemoveBudget.mockResolvedValue(true);
	mockFetchBudgets.mockResolvedValue([]);
	mockSaveLog.mockResolvedValue(undefined);
	mockSendTelegramMessage.mockResolvedValue(undefined);
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
