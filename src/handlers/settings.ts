import type { Sql } from '../types';
import { setUserSetting, getUserSetting, saveLog } from '../db';
import { sendTelegramMessage, answerCallbackQuery, editMessageReplyMarkup } from '../telegram';

type SettingStep = { key: string; label: string; description: string; default: string };

export const SETTINGS_STEPS: SettingStep[] = [
	{
		key: 'category_picker',
		label: 'Category Picker',
		description: 'Suggest existing categories when you type a new one',
		default: 'on',
	},
];

export function buildSettingKeyboard(step: number, currentValue: string): Record<string, unknown> {
	const { key } = SETTINGS_STEPS[step];
	return {
		inline_keyboard: [[
			{ text: currentValue === 'on' ? '✅ ON' : 'ON', callback_data: `setting|${key}|on|${step}` },
			{ text: currentValue === 'off' ? '✅ OFF' : 'OFF', callback_data: `setting|${key}|off|${step}` },
		]],
	};
}

function buildStepText(step: number): string {
	const { label, description } = SETTINGS_STEPS[step];
	return `⚙️ ${label} (${step + 1}/${SETTINGS_STEPS.length})\n${description}`;
}

export async function handleSettings(sql: Sql, telegramUserId: number, token: string, _args: string): Promise<Response> {
	try {
		const step = SETTINGS_STEPS[0];
		const current = (await getUserSetting(sql, telegramUserId, step.key)) ?? step.default;
		await sendTelegramMessage(token, telegramUserId, buildStepText(0), undefined, buildSettingKeyboard(0, current));
		return Response.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		return Response.json({ ok: false, error: message });
	}
}

export async function handleSettingCallback(
	sql: Sql,
	token: string,
	telegramUserId: number,
	chatId: number,
	messageId: number,
	callbackQueryId: string,
	data: string,
): Promise<void> {
	const parts = data.split('|');
	const key = parts[1];
	const value = parts[2];
	const step = parseInt(parts[3], 10);

	try {
		await setUserSetting(sql, telegramUserId, key, value);
		await editMessageReplyMarkup(token, chatId, messageId, {});
		await answerCallbackQuery(token, callbackQueryId);

		const nextStep = step + 1;
		if (nextStep < SETTINGS_STEPS.length) {
			const next = SETTINGS_STEPS[nextStep];
			const current = (await getUserSetting(sql, telegramUserId, next.key)) ?? next.default;
			await sendTelegramMessage(token, chatId, buildStepText(nextStep), undefined, buildSettingKeyboard(nextStep, current));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await saveLog(sql, telegramUserId, message);
		await answerCallbackQuery(token, callbackQueryId, 'Something went wrong');
	}
}
