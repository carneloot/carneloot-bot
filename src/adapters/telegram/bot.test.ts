import { Effect } from 'effect';
import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';

import { createGrammyRunner } from '../../../tests/support/grammy-runner.js';
import type { AppServices } from '../../app/layer.js';
import type { Execute } from '../execute.js';
import type { ConversationStorage } from './conversation-storage.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
	return {
		noOpCommand: async () => undefined,
		passThrough: async (_ctx: unknown, next: () => Promise<unknown>) => next(),
	};
});

const mocks = vi.hoisted(() => ({
	cafeCommand: Object.assign(async () => undefined, { command: 'cafe' }),
	cafeInvCommand: Object.assign(async () => undefined, { command: 'cafeinv' }),
	noOpCommand: async () => undefined,
	passThrough: async (_ctx: unknown, next: () => Promise<unknown>) => next(),
	pingCommand: Object.assign(async () => undefined, { command: 'ping' }),
	whatsCommand: Object.assign(async () => undefined, { command: 'whats' }),
}));

vi.mock('./debug.js', () => ({
	installGrammyDebugLogger: () => () => undefined,
}));
vi.mock('../../middlewares/generic-error.middleware.js', () => ({
	createGenericErrorMiddleware: () => mocks.passThrough,
}));
vi.mock('../../middlewares/reply.js', () => ({
	createReplyMiddleware: () => mocks.passThrough,
}));
vi.mock('../../middlewares/user.middleware.js', () => ({
	createUserMiddleware: () => mocks.passThrough,
}));
vi.mock('./auth.js', () => ({
	createApiKeyConfirmationMenu: () => mocks.passThrough,
	createGenerateApiKeyCommand: () => mocks.noOpCommand,
	createSignupCommand: () => mocks.noOpCommand,
}));
vi.mock('./commands/cafe-inv.js', () => ({
	createCafeInvCommand: () => mocks.cafeInvCommand,
}));
vi.mock('./commands/cafe.js', () => ({
	createCafeCommand: () => mocks.cafeCommand,
}));
vi.mock('./commands/ping.js', () => ({
	createPingCommand: () => mocks.pingCommand,
}));
vi.mock('./commands/whats.js', () => ({
	createWhatsCommand: () => mocks.whatsCommand,
}));
vi.mock('./list-pets.js', () => ({
	createListPetsCommand: () => mocks.noOpCommand,
}));
vi.mock('./pet-food/add-food-all.js', () => ({
	createAddFoodAllCommand: () => mocks.noOpCommand,
}));
vi.mock('./pet-food/food-status.js', () => ({
	createFoodStatusCommand: () => mocks.noOpCommand,
}));
vi.mock('./pet-food/index.js', () => ({
	AddFoodCommand: mocks.noOpCommand,
	CorrectFoodCommand: mocks.noOpCommand,
	DeleteFoodCommand: mocks.noOpCommand,
	SetDayStartCommand: mocks.noOpCommand,
	SetNotificationDelayCommand: mocks.noOpCommand,
	registerPetFoodConversations: () => [],
}));
vi.mock('./pets/index.js', () => ({
	createPetCommand: () => mocks.noOpCommand,
	registerPetConversations: () => [],
}));

import { createBot } from './bot.js';

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

const messageUpdate = (messageId: number, text: string) =>
	({
		update_id: messageId,
		message: {
			message_id: messageId,
			date: 0,
			chat: { id: 1, type: 'private', first_name: 'Test' },
			from: { id: 1, is_bot: false, first_name: 'Test' },
			text,
			entities: [
				{
					offset: 0,
					length: text.split(' ')[0]?.length ?? 0,
					type: 'bot_command',
				},
			],
		},
	}) satisfies Update;

const storage: ConversationStorage = {
	type: 'key',
	prefix: 'test:',
	version: 0,
	adapter: {
		delete: () => Promise.resolve(),
		read: () => Promise.resolve(undefined),
		write: () => Promise.resolve(),
	},
};

// The test runner replaces every Effect service used by the mocked adapters.
const execute = Effect.runPromise as Execute<AppServices>;

describe('grammY regression runner', () => {
	it('dispatches a real update through the registered bot and records its reply', async () => {
		const { bot } = createBot(execute, storage);
		bot.botInfo = botInfo;
		const runner = createGrammyRunner(bot);

		await runner.dispatch(messageUpdate(1, '/start'));

		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'É nóis' },
		});
	});
});
