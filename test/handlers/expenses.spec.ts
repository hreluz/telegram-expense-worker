import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAddExpense, handleDelete, handleUndo, handleNote, handleCallbackQuery } from "../../src/handlers/expenses";
import type { Sql } from "../../src/types";

const { mockSaveExpense, mockSaveLog, mockDeleteExpense, mockDeleteLatestExpense, mockFetchBudgetForCategory, mockFetchCategoryTotals, mockUpdateExpenseNote, mockSendTelegramMessage, mockAnswerCallbackQuery, mockEditMessageReplyMarkup } = vi.hoisted(() => ({
	mockSaveExpense: vi.fn().mockResolvedValue(99),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockDeleteExpense: vi.fn().mockResolvedValue({ found: true, categoryDeleted: false }),
	mockDeleteLatestExpense: vi.fn().mockResolvedValue({ found: true, categoryDeleted: false, expense: { id: 1, amount: 300, category: 'gym', expense_date: '2026-06-17' } }),
	mockFetchBudgetForCategory: vi.fn().mockResolvedValue([]),
	mockFetchCategoryTotals: vi.fn().mockResolvedValue([]),
	mockUpdateExpenseNote: vi.fn().mockResolvedValue(true),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockAnswerCallbackQuery: vi.fn().mockResolvedValue(undefined),
	mockEditMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	saveExpense: mockSaveExpense,
	saveLog: mockSaveLog,
	deleteExpense: mockDeleteExpense,
	deleteLatestExpense: mockDeleteLatestExpense,
	fetchBudgetForCategory: mockFetchBudgetForCategory,
	fetchCategoryTotals: mockFetchCategoryTotals,
	updateExpenseNote: mockUpdateExpenseNote,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	answerCallbackQuery: mockAnswerCallbackQuery,
	editMessageReplyMarkup: mockEditMessageReplyMarkup,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockSaveExpense.mockResolvedValue(99);
	mockSaveLog.mockResolvedValue(undefined);
	mockDeleteExpense.mockResolvedValue({ found: true, categoryDeleted: false });
	mockDeleteLatestExpense.mockResolvedValue({ found: true, categoryDeleted: false, expense: { id: 1, amount: 300, category: 'gym', expense_date: '2026-06-17' } });
	mockFetchBudgetForCategory.mockResolvedValue([]);
	mockFetchCategoryTotals.mockResolvedValue([]);
	mockUpdateExpenseNote.mockResolvedValue(true);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockAnswerCallbackQuery.mockResolvedValue(undefined);
	mockEditMessageReplyMarkup.mockResolvedValue(undefined);
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

describe("handleNote", () => {
	it("sends usage hint when no args given", async () => {
		await handleNote(sql, 42, token, "");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Use: /note <id> [text]");
		expect(mockUpdateExpenseNote).not.toHaveBeenCalled();
	});

	it("sends error when ID is not a number", async () => {
		await handleNote(sql, 42, token, "abc bought shoes");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Invalid ID. Use: /note <id> [text]");
		expect(mockUpdateExpenseNote).not.toHaveBeenCalled();
	});

	it("updates note and confirms with text when note is non-empty", async () => {
		const response = await handleNote(sql, 42, token, "10 bought new shoes");

		const body = await response.json() as { ok: boolean };
		expect(body.ok).toBe(true);
		expect(mockUpdateExpenseNote).toHaveBeenCalledWith(sql, 42, 10, "bought new shoes");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Note updated for expense #10: bought new shoes");
	});

	it("clears note and confirms when no text given", async () => {
		const response = await handleNote(sql, 42, token, "10");

		const body = await response.json() as { ok: boolean };
		expect(body.ok).toBe(true);
		expect(mockUpdateExpenseNote).toHaveBeenCalledWith(sql, 42, 10, "");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Note cleared for expense #10.");
	});

	it("sends not found message when expense does not exist", async () => {
		mockUpdateExpenseNote.mockResolvedValue(false);

		const response = await handleNote(sql, 42, token, "99 some note");

		const body = await response.json() as { ok: boolean };
		expect(body.ok).toBe(false);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Expense #99 not found.");
	});

	it("returns 200 and logs when updateExpenseNote throws", async () => {
		mockUpdateExpenseNote.mockRejectedValue(new Error("DB error"));

		const response = await handleNote(sql, 42, token, "10 some note");

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
