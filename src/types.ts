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
	};
};

export type Expense = {
	amount: number;
	category: string;
	note: string;
};

export type Sql = NeonQueryFunction<false, false>;
