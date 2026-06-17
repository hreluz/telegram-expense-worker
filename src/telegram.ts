export async function sendTelegramMessage(token: string, chatId: number, text: string) {
	const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: chatId, text }),
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Telegram API error ${res.status}: ${error}`);
	}
}

export async function setTelegramCommands(token: string) {
	const commands = [
		{ command: 'list', description: 'Last 10 expenses (or /list 2026-05 to filter)' },
		{ command: 'report', description: 'Export expenses as CSV (or /report 2026-05 to filter)' },
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
