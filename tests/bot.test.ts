import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';

import { createGrammyRunner } from './support/grammy-runner.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

const mocks = vi.hoisted(() => ({
	passThrough: async (_ctx: unknown, next: () => Promise<unknown>) => next(),
}));

vi.mock('../src/lib/redis/redis.js', () => ({
	redis: {
		duplicate: () => {
			const values = new Map<string, string>();
			return {
				del: async (key: string) => values.delete(key),
				get: async (key: string) => values.get(key) ?? null,
				set: async (key: string, value: string) => values.set(key, value),
			};
		},
		options: { host: 'localhost', port: 6379, username: undefined },
	},
}));
vi.mock('../src/middlewares/generic-error.middleware.js', () => ({
	GenericErrorMiddleware: mocks.passThrough,
}));
vi.mock('../src/middlewares/reply.middleware.js', () => ({
	replyMiddleware: mocks.passThrough,
}));
vi.mock('../src/middlewares/user.middleware.js', () => ({
	UserMiddleware: mocks.passThrough,
}));

import { createBot } from '../src/bot.js';

const botInfo = {
	id: 1,
	is_bot: true,
	first_name: 'Test bot',
	username: 'test_bot',
	can_join_groups: true,
	can_read_all_group_messages: false,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
	has_topics_enabled: false,
	allows_users_to_create_topics: false,
	can_manage_bots: false,
	supports_join_request_queries: false,
} satisfies UserFromGetMe;

const startUpdate = {
	update_id: 1,
	message: {
		message_id: 1,
		date: 0,
		chat: { id: 1, type: 'private', first_name: 'Test' },
		from: { id: 1, is_bot: false, first_name: 'Test' },
		text: '/start',
		entities: [{ offset: 0, length: 6, type: 'bot_command' }],
	},
} satisfies Update;

describe('grammY regression runner', () => {
	it('dispatches a real update through the registered bot and records its reply', async () => {
		const { bot } = createBot();
		bot.botInfo = botInfo;
		const runner = createGrammyRunner(bot);

		await runner.dispatch(startUpdate);

		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'É nóis' },
		});
	});
});
