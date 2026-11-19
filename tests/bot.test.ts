import { Effect } from 'effect';
import type { Update, UserFromGetMe } from 'grammy/types';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import type { Context } from '../src/common/types/context.js';
import type { UserID } from '../src/lib/database/schema.js';
import { createGrammyRunner } from './support/grammy-runner.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

const mocks = vi.hoisted(() => ({
	passThrough: async (_ctx: unknown, next: () => Promise<unknown>) => next(),
	registeredUsers: new Set<number>(),
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
	UserMiddleware: async (ctx: Context, next: () => Promise<unknown>) => {
		if (ctx.from && mocks.registeredUsers.has(ctx.from.id)) {
			ctx.user = {
				id: `owner-${ctx.from.id}` as UserID,
				telegramID: ctx.from.id.toString(),
				firstName: 'Test',
				lastName: null,
				username: null,
			};
		}
		return next();
	},
}));
vi.mock('../src/runtime.js', async () => {
	const { Layer, ManagedRuntime } = await import('effect');
	const Database = await import('../src/lib/database/db.js');
	const { NotificationRepository } =
		await import('../src/lib/repositories/notification.js');
	return {
		runtime: ManagedRuntime.make(
			Layer.merge(Database.layer, NotificationRepository.layer),
		),
	};
});

import { createBot } from '../src/bot.js';
import { Database } from '../src/lib/database/db.js';
import { NotificationRepository } from '../src/lib/repositories/notification.js';
import { runtime } from '../src/runtime.js';

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
	const { bot } = createBot();
	bot.botInfo = botInfo;
	return createGrammyRunner(bot);
};

describe('grammY regression runner', () => {
	beforeAll(async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database;
				yield* db.execute((client) =>
					client.$client.executeMultiple(`
				CREATE TABLE users (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL,
					first_name TEXT NOT NULL, last_name TEXT, username TEXT);
				CREATE TABLE notifications (id TEXT PRIMARY KEY, keyword TEXT NOT NULL,
					message TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
					UNIQUE(keyword, owner_id));
				CREATE TABLE users_to_notify (id TEXT PRIMARY KEY, notification_id TEXT, user_id TEXT);
				INSERT INTO users (id, telegram_id, first_name) VALUES
					('owner-1', '1', 'Test'), ('owner-2', '2', 'Other');
			`),
				);
			}),
		);
	});

	afterAll(() => runtime.dispose());

	beforeEach(() => mocks.registeredUsers.clear());

	const getNotification = (owner: number, keyword: string) =>
		runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				return yield* repository.getNotificationByOwnerAndKeyword(
					`owner-${owner}` as UserID,
					keyword,
				);
			}),
		);

	const submitTemplate = async (
		keyword: string,
		message: string,
		owner = 1,
	) => {
		mocks.registeredUsers.add(owner);
		const runner = createRunner();
		let updateID = 100;
		for (const text of ['/criar_notificacao', keyword, message]) {
			const update = commandUpdate(updateID++, text);
			update.message.from.id = owner;
			update.message.chat.id = owner;
			await runner.dispatch(update);
		}
		return runner;
	};

	it('requires registration to create a notification template', async () => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(90, '/criar_notificacao'));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'Por favor cadastre-se primeiro utilizando /cadastrar',
			},
		});
	});

	it('creates an owner-scoped template, preserving placeholders and line breaks', async () => {
		const message = 'Backup de {{nome}} concluído.\nTamanho: {{tamanho}}';
		const runner = await submitTemplate(' backup_concluido ', message);
		expect(
			(await getNotification(1, 'backup_concluido')).notification,
		).toMatchObject({
			ownerID: 'owner-1',
			keyword: 'backup_concluido',
			message,
		});
		expect(runner.calls.at(-1)).toMatchObject({
			method: 'sendMessage',
			payload: { text: expect.stringContaining('Notificação criada!') },
		});
	});

	it('does not overwrite duplicates and allows the same keyword for another owner', async () => {
		await submitTemplate('duplicada', 'Original');
		const runner = await submitTemplate('duplicada', 'Replacement');
		expect((await getNotification(1, 'duplicada')).notification.message).toBe(
			'Original',
		);
		expect(runner.calls.at(-1)).toMatchObject({
			payload: { text: expect.stringContaining('Nada foi alterado') },
		});
		await submitTemplate('duplicada', 'Other owner', 2);
		expect((await getNotification(2, 'duplicada')).notification.message).toBe(
			'Other owner',
		);
	});

	it('reprompts for invalid text and supports cancelling before saving', async () => {
		mocks.registeredUsers.add(1);
		const runner = createRunner();
		let updateID = 200;
		for (const text of [
			'/criar_notificacao',
			'duas palavras',
			'   ',
			'validada',
			'\n ',
			'Mensagem válida',
		]) {
			await runner.dispatch(commandUpdate(updateID++, text));
		}
		expect((await getNotification(1, 'validada')).notification.message).toBe(
			'Mensagem válida',
		);
		for (const text of [
			'/criar_notificacao',
			'cancelada',
			'/cancelar',
			'Não salvar',
		]) {
			await runner.dispatch(commandUpdate(updateID++, text));
		}
		await expect(getNotification(1, 'cancelada')).rejects.toMatchObject({
			_tag: 'NotificationNotFoundError',
		});
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'Operação cancelada',
				reply_markup: { remove_keyboard: true },
			},
		});
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
			payload: {
				chat_id: 1,
				text: 'Me envie a quantidade de café em g. 😄',
			},
		});
	});
});
