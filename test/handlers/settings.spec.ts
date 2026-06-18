import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSettings, handleSettingCallback, SETTINGS_STEPS, buildSettingKeyboard } from "../../src/handlers/settings";
import type { Sql } from "../../src/types";

const { mockSetUserSetting, mockGetUserSetting, mockSaveLog, mockSendTelegramMessage, mockEditMessageReplyMarkup, mockAnswerCallbackQuery } = vi.hoisted(() => ({
	mockSetUserSetting: vi.fn().mockResolvedValue(undefined),
	mockGetUserSetting: vi.fn().mockResolvedValue(null),
	mockSaveLog: vi.fn().mockResolvedValue(undefined),
	mockSendTelegramMessage: vi.fn().mockResolvedValue(undefined),
	mockEditMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
	mockAnswerCallbackQuery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/db", () => ({
	setUserSetting: mockSetUserSetting,
	getUserSetting: mockGetUserSetting,
	saveLog: mockSaveLog,
}));

vi.mock("../../src/telegram", () => ({
	sendTelegramMessage: mockSendTelegramMessage,
	editMessageReplyMarkup: mockEditMessageReplyMarkup,
	answerCallbackQuery: mockAnswerCallbackQuery,
}));

const sql = {} as unknown as Sql;
const token = "test-token";

beforeEach(() => {
	vi.clearAllMocks();
	mockSetUserSetting.mockResolvedValue(undefined);
	mockGetUserSetting.mockResolvedValue(null);
	mockSaveLog.mockResolvedValue(undefined);
	mockSendTelegramMessage.mockResolvedValue(undefined);
	mockEditMessageReplyMarkup.mockResolvedValue(undefined);
	mockAnswerCallbackQuery.mockResolvedValue(undefined);
});

describe("buildSettingKeyboard", () => {
	it("marks ON with ✅ when current value is on", () => {
		const keyboard = buildSettingKeyboard(0, 'on') as { inline_keyboard: { text: string; callback_data: string }[][] };
		const [onBtn, offBtn] = keyboard.inline_keyboard[0];

		expect(onBtn.text).toBe('✅ ON');
		expect(offBtn.text).toBe('OFF');
	});

	it("marks OFF with ✅ when current value is off", () => {
		const keyboard = buildSettingKeyboard(0, 'off') as { inline_keyboard: { text: string; callback_data: string }[][] };
		const [onBtn, offBtn] = keyboard.inline_keyboard[0];

		expect(onBtn.text).toBe('ON');
		expect(offBtn.text).toBe('✅ OFF');
	});

	it("encodes key and step in callback_data", () => {
		const keyboard = buildSettingKeyboard(0, 'on') as { inline_keyboard: { text: string; callback_data: string }[][] };
		const [onBtn, offBtn] = keyboard.inline_keyboard[0];

		expect(onBtn.callback_data).toBe(`setting|${SETTINGS_STEPS[0].key}|on|0`);
		expect(offBtn.callback_data).toBe(`setting|${SETTINGS_STEPS[0].key}|off|0`);
	});
});

describe("handleSettings", () => {
	it("sends the first step message with keyboard when no setting is stored (default on)", async () => {
		mockGetUserSetting.mockResolvedValue(null);

		const response = await handleSettings(sql, 42, token, "");
		const body = await response.json() as { ok: boolean };

		expect(body.ok).toBe(true);
		expect(mockGetUserSetting).toHaveBeenCalledWith(sql, 42, SETTINGS_STEPS[0].key);
		expect(mockSendTelegramMessage).toHaveBeenCalledWith(
			token, 42,
			expect.stringContaining(SETTINGS_STEPS[0].label),
			undefined,
			expect.objectContaining({ inline_keyboard: expect.any(Array) }),
		);
	});

	it("highlights the stored value in the keyboard", async () => {
		mockGetUserSetting.mockResolvedValue('off');

		await handleSettings(sql, 42, token, "");

		const keyboard = (mockSendTelegramMessage.mock.calls[0][4] as { inline_keyboard: { text: string }[][] }).inline_keyboard;
		const [onBtn, offBtn] = keyboard[0];
		expect(onBtn.text).toBe('ON');
		expect(offBtn.text).toBe('✅ OFF');
	});

	it("ignores any args passed", async () => {
		await handleSettings(sql, 42, token, "picker on");

		expect(mockSendTelegramMessage).toHaveBeenCalledOnce();
	});

	it("returns 200 and logs when getUserSetting throws", async () => {
		mockGetUserSetting.mockRejectedValue(new Error("DB error"));

		const response = await handleSettings(sql, 42, token, "");

		expect(response.status).toBe(200);
		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockSendTelegramMessage).not.toHaveBeenCalled();
	});
});

describe("handleSettingCallback", () => {
	it("saves the setting and removes the keyboard", async () => {
		await handleSettingCallback(sql, token, 42, 42, 100, 'cq_1', 'setting|category_picker|off|0');

		expect(mockSetUserSetting).toHaveBeenCalledWith(sql, 42, 'category_picker', 'off');
		expect(mockEditMessageReplyMarkup).toHaveBeenCalledWith(token, 42, 100, {});
	});

	it("answers the callback query silently", async () => {
		await handleSettingCallback(sql, token, 42, 42, 100, 'cq_1', 'setting|category_picker|on|0');

		expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(token, 'cq_1');
	});

	it("does not send a new message when on the last step", async () => {
		await handleSettingCallback(sql, token, 42, 42, 100, 'cq_1', 'setting|category_picker|on|0');

		expect(mockSendTelegramMessage).not.toHaveBeenCalled();
	});

	it("logs and answers with error text when setUserSetting throws", async () => {
		mockSetUserSetting.mockRejectedValue(new Error("DB error"));

		await handleSettingCallback(sql, token, 42, 42, 100, 'cq_1', 'setting|category_picker|off|0');

		expect(mockSaveLog).toHaveBeenCalledWith(sql, 42, "DB error");
		expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(token, 'cq_1', 'Something went wrong');
		expect(mockEditMessageReplyMarkup).not.toHaveBeenCalled();
	});
});
