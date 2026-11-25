import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import { sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { MemorySessionStorage } from 'grammy';
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

import type { Execute } from '../../../src/adapters/execute.js';
import type { AppServices } from '../../../src/app/layer.js';
import type { UserID } from '../../../src/lib/database/schema.js';
import { createGrammyRunner } from '../../support/grammy-runner.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	// Transactions open a second LibSQL connection, so share the in-memory DB.
	process.env.DATABASE_URL = 'file::memory:?cache=shared';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { createBot } from '../../../src/adapters/telegram/bot.js';
import * as Database from '../../../src/lib/database/db.js';
import { NotificationRepository } from '../../../src/lib/repositories/notification.js';
import { UserRepository } from '../../../src/lib/repositories/user.js';

const testRuntime = ManagedRuntime.make(
	Layer.mergeAll(NotificationRepository.layer, UserRepository.layer).pipe(
		Layer.provideMerge(Database.layer),
	),
);

// The bot's notification paths use only these real services. Missing services
// deliberately fail rather than silently making network calls.
const execute = testRuntime.runPromise as Execute<AppServices>;

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

const commandUpdate = (updateId: number, text: string, owner = 1) =>
	({
		update_id: updateId,
		message: {
			message_id: updateId,
			date: 0,
			chat: { id: owner, type: 'private', first_name: 'Test' },
			from: { id: owner, is_bot: false, first_name: 'Test' },
			text,
			entities: text.startsWith('/')
				? [
						{
							offset: 0,
							length: text.split(' ')[0]?.length ?? 0,
							type: 'bot_command',
						},
					]
				: [],
		},
	}) satisfies Update;

const callbackUpdate = (updateId: number, data: string) =>
	({
		update_id: updateId,
		callback_query: {
			id: `callback-${updateId}`,
			from: { id: 1, is_bot: false, first_name: 'Test' },
			chat_instance: 'test-chat',
			data,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: 'private', first_name: 'Test' },
				from: { id: 1, is_bot: true, first_name: 'Test bot' },
				text: 'Escolha uma notificação',
			},
		},
	}) satisfies Update;

const createRunner = () => {
	const { bot } = createBot(execute, {
		type: 'key',
		adapter: new MemorySessionStorage<VersionedState<ConversationData>>(),
	});
	bot.botInfo = botInfo;
	return createGrammyRunner(bot);
};

const executeSql = (query: string) =>
	testRuntime.runPromise(
		Effect.gen(function* () {
			const db = yield* Database.Database;
			return yield* db.execute((client) =>
				client.$client.executeMultiple(query),
			);
		}),
	);

const register = (owner: number) =>
	testRuntime.runPromise(
		Effect.gen(function* () {
			const db = yield* Database.Database;
			yield* db.execute((client) =>
				client.run(sql`
				INSERT OR IGNORE INTO users (id, telegram_id, first_name)
				VALUES (${`owner-${owner}`}, ${String(owner)}, 'Test')
			`),
			);
		}),
	);

const getNotification = (owner: number, keyword: string) =>
	testRuntime.runPromise(
		Effect.gen(function* () {
			const repository = yield* NotificationRepository;
			return yield* repository.getNotificationByOwnerAndKeyword(
				`owner-${owner}` as UserID,
				keyword,
			);
		}),
	);

const submitTemplate = async (keyword: string, message: string, owner = 1) => {
	await register(owner);
	const runner = createRunner();
	let updateID = 100;
	for (const text of ['/criar_notificacao', keyword, message]) {
		await runner.dispatch(commandUpdate(updateID++, text, owner));
	}
	return runner;
};

const getHistory = () =>
	testRuntime.runPromise(
		Effect.gen(function* () {
			const db = yield* Database.Database;
			return yield* db.execute((client) =>
				client.$client.execute(
					'SELECT notification_id FROM notification_history',
				),
			);
		}),
	);

describe('notification template bot regressions', () => {
	beforeAll(() =>
		executeSql(`
		PRAGMA foreign_keys = ON;
		CREATE TABLE users (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL UNIQUE,
			first_name TEXT NOT NULL, last_name TEXT, username TEXT);
		CREATE TABLE notifications (id TEXT PRIMARY KEY, keyword TEXT NOT NULL,
			message TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
			UNIQUE(keyword, owner_id));
		CREATE TABLE users_to_notify (id TEXT PRIMARY KEY,
			notification_id TEXT REFERENCES notifications(id), user_id TEXT REFERENCES users(id));
		CREATE TABLE notification_history (id TEXT PRIMARY KEY,
			notification_id TEXT REFERENCES notifications(id), pet_id TEXT,
			user_id TEXT REFERENCES users(id), message_id INTEGER UNIQUE, sent_at INTEGER,
			UNIQUE(notification_id, user_id));
	`),
	);
	afterAll(() => testRuntime.dispose());
	beforeEach(() =>
		executeSql(
			'DELETE FROM notification_history; DELETE FROM users_to_notify; DELETE FROM notifications; DELETE FROM users;',
		),
	);

	it.each([
		'/criar_notificacao',
		'/listar_notificacoes',
		'/editar_notificacao',
		'/deletar_notificacao',
	])('requires registration for %s', async (command) => {
		const runner = createRunner();
		await runner.dispatch(commandUpdate(90, command));
		expect(runner.calls).toContainEqual({
			method: 'sendMessage',
			payload: {
				chat_id: 1,
				text: 'Por favor cadastre-se primeiro utilizando /cadastrar',
			},
		});
	});

	it.each([
		'/listar_notificacoes',
		'/editar_notificacao',
		'/deletar_notificacao',
	])('reports an empty list for %s', async (command) => {
		await register(1);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(91, command));
		expect(runner.calls.at(-1)).toMatchObject({
			payload: {
				text: 'Você não tem notificações cadastradas. Use /criar_notificacao para criar uma.',
			},
		});
	});

	it('lists only the current owner templates, including their full messages', async () => {
		const message = '🎉 {{project}}\n<b>{{title}}</b> & `details`';
		await submitTemplate('claude_done', message);
		await submitTemplate('deploy_🎉', 'Deploy concluído!');
		await submitTemplate('secret', 'Other owner private message', 2);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(300, '/listar_notificacoes'));
		expect(
			runner.calls
				.filter((call) => call.method === 'sendMessage')
				.map((call) => call.payload),
		).toEqual([
			{
				chat_id: 1,
				text: `Suas notificações (2)\n\nclaude_done\n${message}\n\ndeploy_🎉\nDeploy concluído!`,
				entities: [
					{ type: 'bold', offset: 0, length: 21 },
					{ type: 'code', offset: 23, length: 11 },
					{ type: 'pre', offset: 35, length: message.length },
					{ type: 'code', offset: 37 + message.length, length: 9 },
					{ type: 'pre', offset: 47 + message.length, length: 17 },
				],
				link_preview_options: { is_disabled: true },
			},
		]);
	});

	it('keeps notification blocks together when the list exceeds the Telegram limit', async () => {
		await submitTemplate('first', 'a'.repeat(2500));
		const secondMessage = `${'b'.repeat(1000)}\n\n${'c'.repeat(998)}`;
		await submitTemplate('second', secondMessage);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(301, '/listar_notificacoes'));
		expect(
			runner.calls
				.filter((call) => call.method === 'sendMessage')
				.map((call) => call.payload),
		).toEqual([
			{
				chat_id: 1,
				text: `Suas notificações (2)\n\nfirst\n${'a'.repeat(2500)}\n\n`,
				entities: [
					{ type: 'bold', offset: 0, length: 21 },
					{ type: 'code', offset: 23, length: 5 },
					{ type: 'pre', offset: 29, length: 2500 },
				],
				link_preview_options: { is_disabled: true },
			},
			{
				chat_id: 1,
				text: `second\n${secondMessage}`,
				entities: [
					{ type: 'code', offset: 0, length: 6 },
					{ type: 'pre', offset: 7, length: 2000 },
				],
				link_preview_options: { is_disabled: true },
			},
		]);
	});

	it('preserves oversized templates and emoji when splitting messages', async () => {
		const message = `${'a'.repeat(4089)}🎉${'b'.repeat(100)}`;
		await submitTemplate('large', message);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(302, '/listar_notificacoes'));
		const replies = runner.calls
			.filter((call) => call.method === 'sendMessage')
			.map(
				(call) =>
					call.payload as {
						text: string;
						entities: { type: string; offset: number; length: number }[];
					},
			);
		expect(replies.map((reply) => reply.text).join('')).toBe(
			`Suas notificações (1)\n\nlarge\n${message}`,
		);
		expect(replies).toHaveLength(3);
		for (const reply of replies) {
			expect(reply.text.length).toBeLessThanOrEqual(4096);
			expect(reply.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
			for (const entity of reply.entities) {
				expect(entity.offset).toBeGreaterThanOrEqual(0);
				expect(entity.length).toBeGreaterThan(0);
				expect(entity.offset + entity.length).toBeLessThanOrEqual(
					reply.text.length,
				);
			}
		}
		expect(
			replies
				.flatMap((reply) =>
					reply.entities
						.filter((entity) => entity.type === 'pre')
						.map((entity) =>
							reply.text.slice(entity.offset, entity.offset + entity.length),
						),
				)
				.join(''),
		).toBe(message);
	});

	it('edits the selected message, rejecting blank input without changing the keyword or another owner', async () => {
		await submitTemplate('another_template', 'Keep this message');
		await submitTemplate('claude_done', 'Original');
		await submitTemplate('claude_done', 'Other owner', 2);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(310, '/editar_notificacao'));
		await runner.dispatch(callbackUpdate(311, 'values-1'));
		await runner.dispatch(commandUpdate(312, '  \n'));
		const message = '✅ {{project}}\n🏷️ {{title}}';
		await runner.dispatch(commandUpdate(313, message));
		expect((await getNotification(1, 'claude_done')).notification.message).toBe(
			message,
		);
		expect(
			(await getNotification(1, 'another_template')).notification.message,
		).toBe('Keep this message');
		expect((await getNotification(2, 'claude_done')).notification.message).toBe(
			'Other owner',
		);
		expect(runner.calls.at(-1)).toMatchObject({
			payload: {
				text: 'Notificação atualizada! A palavra-chave continua a mesma.',
			},
		});
	});

	it('keeps the original message when editing is cancelled', async () => {
		await submitTemplate('claude_done', 'Original');
		const runner = createRunner();
		await runner.dispatch(commandUpdate(320, '/editar_notificacao'));
		await runner.dispatch(callbackUpdate(321, 'values-0'));
		await runner.dispatch(commandUpdate(322, '/cancelar'));
		await runner.dispatch(commandUpdate(323, 'Do not save'));
		expect((await getNotification(1, 'claude_done')).notification.message).toBe(
			'Original',
		);
	});

	it('keeps a template when deletion is declined or selection is cancelled', async () => {
		await submitTemplate('claude_done', 'Original');
		const runner = createRunner();
		await runner.dispatch(commandUpdate(330, '/deletar_notificacao'));
		await runner.dispatch(callbackUpdate(331, 'Cancelar'));
		await runner.dispatch(commandUpdate(332, '/deletar_notificacao'));
		await runner.dispatch(callbackUpdate(333, 'values-0'));
		await runner.dispatch(callbackUpdate(334, 'values-1'));
		expect((await getNotification(1, 'claude_done')).notification.message).toBe(
			'Original',
		);
		expect(runner.calls.at(-1)).toMatchObject({
			payload: { text: 'Operação cancelada. A notificação foi mantida.' },
		});
	});

	it('deletes a confirmed template and its dependent records without affecting another owner', async () => {
		await submitTemplate('claude_done', 'Original');
		await submitTemplate('keep_me', 'Keep this template');
		await submitTemplate('claude_done', 'Other owner', 2);
		const { notification } = await getNotification(1, 'claude_done');
		const other = (await getNotification(2, 'claude_done')).notification;
		await testRuntime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database.Database;
				yield* db.execute((client) =>
					client.run(sql`
				INSERT INTO users_to_notify (id, notification_id, user_id) VALUES
				('recipient-1', ${notification.id}, 'owner-2'), ('recipient-2', ${other.id}, 'owner-1')
			`),
				);
				const repository = yield* NotificationRepository;
				yield* repository.createNotificationHistory({
					notificationID: notification.id,
					petID: null,
					userID: 'owner-1' as UserID,
					messageID: 1000,
				});
				yield* repository.createNotificationHistory({
					notificationID: other.id,
					petID: null,
					userID: 'owner-2' as UserID,
					messageID: 1001,
				});
				expect(
					yield* repository.updateNotification(
						'owner-2' as UserID,
						notification.id,
						'Unauthorized',
					),
				).toBe(false);
				expect(
					yield* repository.deleteNotification(
						'owner-2' as UserID,
						notification.id,
					),
				).toBe(false);
			}),
		);
		expect(
			(await getNotification(1, 'claude_done')).usersToNotify,
		).toHaveLength(1);
		const runner = createRunner();
		await runner.dispatch(commandUpdate(340, '/deletar_notificacao'));
		await runner.dispatch(callbackUpdate(341, 'values-0'));
		await runner.dispatch(callbackUpdate(342, 'values-0'));
		expect(runner.calls).toContainEqual({
			method: 'editMessageText',
			payload: expect.objectContaining({
				text: 'Deletar a notificação claude\\_done? Seus destinatários e histórico também serão removidos\\. Chamadas da API com essa palavra\\-chave deixarão de funcionar\\.\n>>Sim',
				parse_mode: 'MarkdownV2',
			}),
		});
		await expect(getNotification(1, 'claude_done')).rejects.toMatchObject({
			_tag: 'NotificationNotFoundError',
		});
		expect((await getNotification(1, 'keep_me')).notification.message).toBe(
			'Keep this template',
		);
		expect(
			(await getNotification(2, 'claude_done')).usersToNotify,
		).toHaveLength(1);
		expect((await getHistory()).rows.map((row) => row.notification_id)).toEqual(
			[other.id],
		);
		expect(runner.calls.at(-1)).toMatchObject({
			payload: { text: 'Notificação deletada!' },
		});
	});

	it('rolls back recipient and history deletion if removing the template fails', async () => {
		await submitTemplate('claude_done', 'Original');
		await register(2);
		const { notification } = await getNotification(1, 'claude_done');
		await testRuntime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database.Database;
				yield* db.execute((client) =>
					client.run(sql`
				INSERT INTO users_to_notify (id, notification_id, user_id)
				VALUES ('recipient-1', ${notification.id}, 'owner-2')
			`),
				);
				const repository = yield* NotificationRepository;
				yield* repository.createNotificationHistory({
					notificationID: notification.id,
					petID: null,
					userID: 'owner-1' as UserID,
					messageID: 1000,
				});
			}),
		);
		await executeSql(`CREATE TRIGGER block_notification_delete BEFORE DELETE ON notifications
			BEGIN SELECT RAISE(ABORT, 'blocked for rollback test'); END;`);
		try {
			await expect(
				testRuntime.runPromise(
					Effect.gen(function* () {
						const repository = yield* NotificationRepository;
						return yield* repository.deleteNotification(
							'owner-1' as UserID,
							notification.id,
						);
					}),
				),
			).rejects.toBeDefined();
			expect(
				(await getNotification(1, 'claude_done')).notification.message,
			).toBe('Original');
			expect(
				(await getNotification(1, 'claude_done')).usersToNotify,
			).toHaveLength(1);
			expect(
				(await getHistory()).rows.map((row) => row.notification_id),
			).toEqual([notification.id]);
		} finally {
			await executeSql('DROP TRIGGER block_notification_delete;');
		}
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
		await register(1);
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
});
