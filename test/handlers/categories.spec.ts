import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRename } from "../../src/handlers/categories";
import type { Sql } from "../../src/types";

const { mockRenameCategory, mockSaveLog, mockSendTelegramMessage } = vi.hoisted(() => ({
	mockRenameCategory: vi.fn().mockResolvedValue({ found: true, count: 3 }),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	renameCategory: mockRenameCategory,
	saveLog: mockSaveLog,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockRenameCategory.mockResolvedValue({ found: true, count: 3 });
	mockSaveLog.mockResolvedValue(undefined);
	mockSendTelegramMessage.mockResolvedValue(undefined);
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
