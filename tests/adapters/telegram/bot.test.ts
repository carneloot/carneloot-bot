import { Effect } from 'effect';
import type { Update, UserFromGetMe } from 'grammy/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Execute } from '../../../src/adapters/execute.js';
import type { ConversationStorage } from '../../../src/adapters/telegram/conversation-storage.js';
import type { AppServices } from '../../../src/app/layer.js';
import { createGrammyRunner } from '../../support/grammy-runner.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('../../../src/middlewares/generic-error.middleware.js', () => ({
	createGenericErrorMiddleware:
		() => async (_ctx: unknown, next: () => Promise<unknown>) =>
			next(),
}));
vi.mock('../../../src/adapters/telegram/reply.js', () => ({
	createReplyMiddleware:
		() => async (_ctx: unknown, next: () => Promise<unknown>) =>
			next(),
}));
vi.mock('../../../src/middlewares/user.middleware.js', () => ({
	createUserMiddleware:
		() => async (_ctx: unknown, next: () => Promise<unknown>) =>
			next(),
}));

import { createBot } from '../../../src/adapters/telegram/bot.js';

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

const commandUpdate = (updateId: number, text: string) =>
	({
		update_id: updateId,
		message: {
			message_id: updateId,
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

const createRunner = () => {
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
	// These commands use no application services. A missing service fails the test.
	const telegram = createBot(
		Effect.runPromise as Execute<AppServices>,
		storage,
	);
	telegram.bot.botInfo = botInfo;
	return { ...createGrammyRunner(telegram.bot), ...telegram };
};

describe('registered bot command regressions', () => {
	afterEach(() => vi.restoreAllMocks());

	it('publishes only the default menu and removes the Portuguese override', async () => {
		const runner = createRunner();
		await runner.setCommands();
		expect(runner.calls).toEqual([
			{
				method: 'setMyCommands',
				payload: {
					commands: expect.arrayContaining(
						[
							'ping',
							'criar_notificacao',
							'listar_notificacoes',
							'editar_notificacao',
							'deletar_notificacao',
						].map((command) =>
							expect.objectContaining({
								command,
								description: expect.any(String),
							}),
						),
					),
				},
			},
			{ method: 'deleteMyCommands', payload: { language_code: 'pt' } },
		]);
	});

	it('dispatches a real update through the registered bot and records its reply', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(1, '/start'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'É nóis' },
		});
	});

	it('runs /ping through command parsing and replies to its source message', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(2, '/ping 0'));
		expect(runner.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					chat_id: 1,
					reply_parameters: { message_id: 2 },
					text: 'pong 0',
				}),
			}),
		);
	});

	it('runs /whats through command parsing and encodes the generated URL', async () => {
		const runner = createRunner();
		await runner.dispatch(
			commandUpdate(3, '/whats (11) 91234-5678 Olá, mundo!'),
		);
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'https://wa.me/5511912345678?text=Ol%C3%A1%2C%20mundo%21',
			},
		});
	});

	it('reports an invalid /whats input through the bot', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(4, '/whats hello'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'Envie uma mensagem no formato (00) 0 0000-0000 [mensagem]. A mensagem, os espaços e os algarismos não numéricos são opcionais',
			},
		});
	});

	it('runs /cafe through command parsing and sends the calculated schedule', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.6);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(5, '/cafe 500ml'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'Quantidade de café: 30 g' },
		});
		expect(runner.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: expect.stringContaining('Até 500 g'),
				}),
			}),
		);
	});

	it('asks for water when /cafe input is incompatible', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(6, '/cafe 20g'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'Me envie a quantidade inicial de água em ml. 😄',
			},
		});
	});

	it('runs /cafe_inv through command parsing and sends the calculated schedule', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.6);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(7, '/cafe_inv 30g'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'Quantidade de água: 500 ml' },
		});
		expect(runner.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: expect.stringContaining('Até 500 g'),
				}),
			}),
		);
	});

	it('asks for coffee when /cafe_inv input is incompatible', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(8, '/cafe_inv 500ml'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: { chat_id: 1, text: 'Me envie a quantidade de café em g. 😄' },
		});
	});
});
