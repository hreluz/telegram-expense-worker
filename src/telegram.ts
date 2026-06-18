export async function sendTelegramMessage(token: string, chatId: number, text: string, parseMode?: string, replyMarkup?: Record<string, unknown>) {
	const body: Record<string, unknown> = { chat_id: chatId, text };
	if (parseMode) body.parse_mode = parseMode;
	if (replyMarkup) body.reply_markup = replyMarkup;
	const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function setTelegramCommands(token: string) {
	const commands = [
		{ command: 'list', description: 'Last 10 expenses (or /list 2026-05 to filter)' },
		{ command: 'top', description: 'Top expenses by amount (e.g. /top 5 or /top 5 2026-05)' },
		{ command: 'compare', description: 'Compare spending across two periods (e.g. /compare gym 2026-04 2026-05)' },
		{ command: 'note', description: 'Update the note on an expense by ID' },
		{ command: 'search', description: 'Find expenses by keyword (category or note)' },
		{ command: 'report', description: 'Export expenses as CSV (or /report 2026-05 to filter)' },
		{ command: 'delete', description: 'Delete an expense by ID' },
		{ command: 'rename', description: 'Merge one category into another' },
		{ command: 'undo', description: 'Delete the most recently added expense' },
		{ command: 'summary', description: 'Spending snapshot for the current month' },
		{ command: 'budget', description: 'Set or view monthly category budgets' },
		{ command: 'help', description: 'Show commands and examples' },
	];
	const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ commands }),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function sendTelegramDocument(token: string, chatId: number, filename: string, content: string) {
	const form = new FormData();
	form.append('chat_id', String(chatId));
	form.append('document', new Blob([content], { type: 'text/csv' }), filename);
	const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
		method: 'POST',
		body: form,
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
	const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
	if (text) body.text = text;
	const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function editMessageReplyMarkup(token: string, chatId: number, messageId: number, replyMarkup: Record<string, unknown>) {
	const res = await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function dropPendingUpdates(token: string, webhookUrl: string) {
	const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}
