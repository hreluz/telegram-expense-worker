import type { NeonQueryFunction } from "@neondatabase/serverless";

export type Env = {
	DATABASE_URL: string;
	TELEGRAM_TOKEN: string;
	ADMIN_IDS?: string; // comma-separated Telegram user IDs allowed to run /migrate
};

export type TelegramBody = {
	message?: {
		text?: string;
		from?: { id?: number };
		message_id?: number;
	};
	callback_query?: {
		id: string;
		from: { id: number };
		message?: { message_id: number; chat?: { id: number } };
		data?: string;
	};
};

export type Expense = {
	amount: number;
	category: string;
	note: string;
	expenseDate: string; // ISO 8601: "YYYY-MM-DD"
};

export type Sql = NeonQueryFunction<false, false>;
