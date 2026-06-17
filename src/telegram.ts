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
		{ command: 'list', description: 'Last 10 expenses' },
		{ command: 'report', description: 'Export full history as CSV' },
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
