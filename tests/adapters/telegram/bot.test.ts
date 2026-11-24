import debug from 'debug';
import { Effect, Layer, ManagedRuntime, Option, Schema } from 'effect';
import type { Update, UserFromGetMe } from 'grammy/types';
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import type { Execute } from '../../../src/adapters/execute.js';
import { PetFoodNotificationQueue } from '../../../src/adapters/queue/pet-food-notification.js';
import type { ConversationStorage } from '../../../src/adapters/telegram/conversation-storage.js';
import { ConversationPersistenceLive } from '../../../src/adapters/telegram/conversation-storage.js';
import { NotificationSender } from '../../../src/adapters/telegram/notification-sender.js';
import type { AppServices } from '../../../src/app/layer.js';
import {
	Database,
	layer as databaseLayer,
} from '../../../src/lib/database/db.js';
import { ConfigService } from '../../../src/lib/entities/config.js';
import { NotificationRepository } from '../../../src/lib/repositories/notification.js';
import { PetFoodSchedulingOutboxRepository } from '../../../src/lib/repositories/pet-food-scheduling-outbox.js';
import { PetFoodRepository } from '../../../src/lib/repositories/pet-food.js';
import { PetRepository } from '../../../src/lib/repositories/pet.js';
import { UserRepository } from '../../../src/lib/repositories/user.js';
import { NotificationService } from '../../../src/lib/services/notification.js';
import { PetFoodService } from '../../../src/lib/services/pet-food.js';
import { createGrammyRunner } from '../../support/grammy-runner.js';
import { createTestRedis } from '../../support/test-redis.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import {
	createBot,
	TelegramBot,
	TelegramBotLive,
} from '../../../src/adapters/telegram/bot.js';

const runtime = ManagedRuntime.make(
	UserRepository.layer.pipe(Layer.provideMerge(databaseLayer)),
);

beforeAll(async () => {
	await runtime.runPromise(
		Effect.gen(function* () {
			const db = yield* Database;
			yield* db.execute((client) =>
				client.$client.executeMultiple(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY NOT NULL,
				telegram_id TEXT NOT NULL UNIQUE,
				first_name TEXT NOT NULL,
				last_name TEXT,
				username TEXT
			);
			CREATE TABLE api_keys (
				id TEXT PRIMARY KEY NOT NULL,
				user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
				key TEXT NOT NULL UNIQUE,
				created_at INTEGER NOT NULL
			);
		`),
			);
		}),
	);
});

beforeEach(async () => {
	await runtime.runPromise(
		Effect.gen(function* () {
			const db = yield* Database;
			yield* db.execute((client) =>
				client.$client.executeMultiple(
					'DELETE FROM api_keys; DELETE FROM users;',
				),
			);
		}),
	);
});

afterAll(() => runtime.dispose());

const botInfo = {
	id: 999,
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
	// Use real user persistence; any unexpected application service access fails.
	const telegram = createBot(
		runtime.runPromise as Execute<AppServices>,
		storage,
	);
	telegram.bot.botInfo = botInfo;
	return { ...createGrammyRunner(telegram.bot), ...telegram };
};

describe('registered bot command regressions', () => {
	afterEach(() => vi.restoreAllMocks());

	it('registers a webhook with a separate Telegram secret token', async () => {
		const runner = createRunner();
		await runner.setWebhook(
			'https://test.example/api/webhook',
			'independent-secret',
		);
		expect(runner.calls).toEqual([
			{
				method: 'setWebhook',
				payload: {
					url: 'https://test.example/api/webhook',
					secret_token: 'independent-secret',
				},
			},
		]);
	});

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
							'whats',
							'cafe',
							'cafe_inv',
							'cancelar',
							'cadastrar',
							'gerar_chave',
							'adicionar_pet',
							'deletar_pet',
							'listar_pets',
							'adicionar_cuidador',
							'remover_cuidador',
							'listar_cuidadores',
							'convites_pet',
							'parar_de_cuidar_pet',
							'configurar_inicio_dia',
							'configurar_atraso_notificacao',
							'status_racao',
							'colocar_racao',
							'colocar_racao_todos',
							'todos',
							'deletar_racao',
							'corrigir_racao',
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

	it('builds a scoped bot without a delivery mode and captures its application services', async () => {
		const originalLog = debug.log;
		const originalFormatArgs = debug.formatArgs;
		const dependencies = Layer.mergeAll(
			ConversationPersistenceLive.pipe(
				Layer.provideMerge(createTestRedis().layer),
			),
			Layer.mock(PetFoodNotificationQueue, {}),
			Layer.mock(NotificationSender, {}),
			Layer.mock(NotificationService, {}),
			Layer.mock(NotificationRepository, {}),
			Layer.mock(PetRepository, {}),
			Layer.mock(PetFoodRepository, {}),
			Layer.mock(PetFoodSchedulingOutboxRepository, {}),
			Layer.mock(PetFoodService, {}),
			Layer.mock(ConfigService, {}),
		);
		await runtime.runPromise(
			Effect.gen(function* () {
				const telegram = yield* TelegramBot;
				telegram.bot.botInfo = botInfo;
				const runner = createGrammyRunner(telegram.bot);
				expect(telegram.bot.isRunning()).toBe(false);
				expect(runner.calls).toEqual([]);
				yield* Effect.promise(() =>
					runner.dispatch(commandUpdate(1, '/cadastrar')),
				);
				const users = yield* UserRepository;
				expect(Option.isSome(yield* users.getUserByTelegramID(1))).toBe(true);
				expect(runner.calls).toContainEqual({
					method: 'sendMessage',
					payload: { chat_id: 1, text: 'Usuário cadastrado com sucesso!' },
				});
			}).pipe(
				Effect.provide(TelegramBotLive.pipe(Layer.provide(dependencies))),
			),
		);
		expect(debug.log).toBe(originalLog);
		expect(debug.formatArgs).toBe(originalFormatArgs);
	});

	it.each(['Yes', 'No'] as const)(
		'handles API key confirmation %s through a fresh callback update',
		async (answer) => {
			const oldKey = await runtime.runPromise(
				Effect.gen(function* () {
					const users = yield* UserRepository;
					yield* users.createUser({ id: 1, is_bot: false, first_name: 'Test' });
					const user = yield* users.getUserByTelegramID(1);
					assert(Option.isSome(user));
					return yield* users.generateApiKeyForUser(user.value.id);
				}),
			);
			const runner = createRunner();
			await runner.dispatch(commandUpdate(1, '/gerar_chave'));
			const prompt = runner.calls.find((call) => call.method === 'sendMessage');
			assert(prompt);
			const { text, reply_markup } = Schema.decodeUnknownSync(
				Schema.Struct({
					text: Schema.String,
					reply_markup: Schema.Struct({
						inline_keyboard: Schema.Array(
							Schema.Array(
								Schema.Struct({
									text: Schema.String,
									callback_data: Schema.String,
								}),
							),
						),
					}),
				}),
			)(prompt.payload);
			const button = reply_markup.inline_keyboard
				.flat()
				.find((button) => button.text === answer);
			assert(button);
			await runner.dispatch({
				update_id: 2,
				callback_query: {
					id: 'key-confirmation',
					from: { id: 1, is_bot: false, first_name: 'Test' },
					chat_instance: 'test-chat',
					data: button.callback_data,
					message: {
						message_id: 10,
						date: 0,
						chat: { id: 1, type: 'private', first_name: 'Test' },
						from: botInfo,
						text,
						reply_markup: {
							inline_keyboard: reply_markup.inline_keyboard.map((row) => [
								...row,
							]),
						},
					},
				},
			});
			const oldKeyUser = await runtime.runPromise(
				UserRepository.pipe(
					Effect.flatMap((users) => users.getUserFromApiKey(oldKey)),
					Effect.option,
				),
			);
			if (answer === 'Yes') {
				expect(Option.isNone(oldKeyUser)).toBe(true);
				const reply = runner.calls
					.filter((call) => call.method === 'sendMessage')
					.at(-1);
				assert(reply);
				const body = Schema.decodeUnknownSync(
					Schema.Struct({ text: Schema.String }),
				)(reply.payload);
				const newKey = /^Aqui está: <pre>([^<]+)<\/pre>$/.exec(body.text)?.[1];
				assert(newKey);
				expect(newKey).not.toBe(oldKey);
				const owner = await runtime.runPromise(
					UserRepository.pipe(
						Effect.flatMap((users) => users.getUserFromApiKey(newKey)),
					),
				);
				expect(owner.telegramID).toBe('1');
			} else {
				expect(Option.isSome(oldKeyUser)).toBe(true);
				expect(runner.calls).toContainEqual({
					method: 'sendMessage',
					payload: { chat_id: 1, text: 'Okay!' },
				});
			}
			expect(runner.calls).toContainEqual({
				method: 'editMessageReplyMarkup',
				payload: {
					chat_id: 1,
					message_id: 10,
					reply_markup: undefined,
				},
			});
		},
	);

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
