import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTelegramMessage } from "../src/telegram";

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
});
