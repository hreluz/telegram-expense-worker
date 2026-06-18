import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMigrate, handleLogs, handleDropPending } from "../../src/handlers/admin";
import type { Sql } from "../../src/types";

const { mockMigrate, mockSaveLog, mockFetchLogs, mockSendTelegramMessage, mockDropPendingUpdates, mockSetTelegramCommands } = vi.hoisted(() => ({
	mockMigrate: vi.fn().mockResolvedValue(undefined),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockFetchLogs: vi.fn().mockResolvedValue([]),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockDropPendingUpdates: vi.fn().mockResolvedValue(undefined),
	mockSetTelegramCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	migrate: mockMigrate,
	saveLog: mockSaveLog,
	fetchLogs: mockFetchLogs,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	dropPendingUpdates: mockDropPendingUpdates,
	setTelegramCommands: mockSetTelegramCommands,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockMigrate.mockResolvedValue(undefined);
	mockSaveLog.mockResolvedValue(undefined);
	mockFetchLogs.mockResolvedValue([]);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockDropPendingUpdates.mockResolvedValue(undefined);
	mockSetTelegramCommands.mockResolvedValue(undefined);
});

describe("handleMigrate", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleMigrate(sql, 42, token, undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "999,888");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("runs migration, sets commands, and replies when user is in the allowed list", async () => {
		const response = await handleMigrate(sql, 42, token, "42,99");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockMigrate).toHaveBeenCalledWith(sql);
		expect(mockSetTelegramCommands).toHaveBeenCalledWith(token);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Migration complete.");
	});

	it("trims spaces around IDs in ADMIN_IDS", async () => {
		const response = await handleMigrate(sql, 42, token, " 42 , 99 ");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
	});

	it("logs the error and sends a failure message when migrate throws", async () => {
		mockMigrate.mockRejectedValue(new Error("Migration error"));

		const response = await handleMigrate(sql, 42, token, "42");

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "Migration error");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Migration failed.");
	});
});

describe("handleLogs", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleLogs(sql, 42, token, undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleLogs(sql, 42, token, "999,888");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("sends 'No logs.' when there are no logs", async () => {
		await handleLogs(sql, 42, token, "42");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "No logs.");
	});

	it("sends formatted log entries", async () => {
		mockFetchLogs.mockResolvedValue([
			{ message: "DB connection failed", created_at: "2026-01-01T10:00:00Z" },
		]);

		await handleLogs(sql, 42, token, "42");

		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "[2026-01-01T10:00:00Z] DB connection failed");
	});

	it("returns rows in the response", async () => {
		const rows = [{ message: "DB connection failed", created_at: "2026-01-01T10:00:00Z" }];
		mockFetchLogs.mockResolvedValue(rows);

		const response = await handleLogs(sql, 42, token, "42");
		const body = await response.json() as { ok: boolean; rows: unknown[] };

		expect(body.ok).toBe(true);
		expect(body.rows).toEqual(rows);
	});

	it("returns 500 and sends a generic message when fetchLogs throws", async () => {
		mockFetchLogs.mockRejectedValue(new Error("DB connection failed"));

		const response = await handleLogs(sql, 42, token, "42");

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Something went wrong.");
	});
});

describe("handleDropPending", () => {
	it("returns 500 when ADMIN_IDS is not configured", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", undefined);

		expect(response.status).toBe(500);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "ADMIN_IDS is not configured.");
	});

	it("returns 200 when user is not in the allowed list", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", "999");

		expect(response.status).toBe(200);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Unauthorized.");
	});

	it("calls dropPendingUpdates and replies when user is admin", async () => {
		const response = await handleDropPending(sql, 42, token, "https://example.com", "42");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockDropPendingUpdates).toHaveBeenCalledWith(token, "https://example.com");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Pending updates dropped.");
	});

	it("logs the error and sends a failure message when dropPendingUpdates throws", async () => {
		mockDropPendingUpdates.mockRejectedValue(new Error("Telegram API error 400: Bad Request"));

		const response = await handleDropPending(sql, 42, token, "https://example.com", "42");

		expect(response.status).toBe(500);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "Telegram API error 400: Bad Request");
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(token, 42, "Failed to drop pending updates.");
	});
});
