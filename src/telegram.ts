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
