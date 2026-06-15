import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTelegramMessage, dropPendingUpdates } from "../src/telegram";

const mockFetch = vi.fn().mockResolvedValue(new Response());

vi.stubGlobal("fetch", mockFetch);

describe("sendTelegramMessage", () => {
	beforeEach(() => vi.clearAllMocks());

	it("calls the Telegram API with the correct URL", async () => {
		await sendTelegramMessage("mytoken", 42, "Hello!");

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.telegram.org/botmytoken/sendMessage");
	});

	it("sends chat_id and text in the body", async () => {
		await sendTelegramMessage("mytoken", 42, "Hello!");

		const [, options] = mockFetch.mock.calls[0];
		expect(options.method).toBe("POST");
		expect(JSON.parse(options.body)).toEqual({ chat_id: 42, text: "Hello!" });
	});

	it("throws when the Telegram API returns an error", async () => {
		mockFetch.mockResolvedValue(
			new Response('{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}', { status: 400 })
		);

		await expect(sendTelegramMessage("mytoken", 42, "Hello!")).rejects.toThrow("Telegram API error 400:");
	});
});

describe("dropPendingUpdates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue(new Response());
	});

	it("calls the setWebhook endpoint with drop_pending_updates", async () => {
		await dropPendingUpdates("mytoken", "https://my-worker.example.com");

		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.telegram.org/botmytoken/setWebhook");
		expect(JSON.parse(options.body)).toEqual({ url: "https://my-worker.example.com", drop_pending_updates: true });
	});

	it("throws when the Telegram API returns an error", async () => {
		mockFetch.mockResolvedValue(new Response("Bad Request", { status: 400 }));

		await expect(dropPendingUpdates("mytoken", "https://my-worker.example.com")).rejects.toThrow("Telegram API error 400:");
	});
});
