import { createClient } from '@libsql/client';
import { trace } from '@opentelemetry/api';
import {
	Deferred,
	Duration,
	Effect,
	Fiber,
	Layer,
	ManagedRuntime,
} from 'effect';
import type { Update, UserFromGetMe } from 'grammy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:?cache=shared';
	process.env.REDIS_URL = 'redis://localhost:6379';
	process.env.DEBUG = '1';
});

import type { Execute } from '../../../../src/adapters/execute.js';
import { HealthLive } from '../../../../src/adapters/http/health.js';
import {
	createBot,
	TelegramBot,
} from '../../../../src/adapters/telegram/bot.js';
import {
	ConversationPersistence,
	ConversationPersistenceLive,
} from '../../../../src/adapters/telegram/conversation-storage.js';
import type { AppServices } from '../../../../src/app/layer.js';
import * as Database from '../../../../src/lib/database/db.js';
import {
	petFoodTable,
	type PetFoodID,
	type PetID,
	type UserID,
} from '../../../../src/lib/database/schema.js';
import { syncDatabaseSchema } from '../../../../src/lib/database/sync-schema.js';
import { ConfigService } from '../../../../src/lib/entities/config.js';
import { PetFoodRepository } from '../../../../src/lib/repositories/pet-food.js';
import { PetRepository } from '../../../../src/lib/repositories/pet.js';
import { UserRepository } from '../../../../src/lib/repositories/user.js';
import { PetFoodService } from '../../../../src/lib/services/pet-food.js';
import { createGrammyRunner } from '../../../support/grammy-runner.js';
import { createTestHttp } from '../../../support/http.js';
import { createTestRedis } from '../../../support/test-redis.js';

const botInfo = {
	id: 100,
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

const now = Date.parse('2026-11-23T16:00:00Z');
const petID = 'pet-1' as PetID;

const setup = async () => {
	// Keep one connection alive across LibSQL transaction connection replacement
	// and application restarts. The database is destroyed when this test closes it.
	const anchor = createClient({ url: 'file::memory:?cache=shared' });
	await anchor.execute('SELECT 1');
	const redis = createTestRedis();
	const database = Layer.fresh(Database.layer);
	const persistence = Layer.mergeAll(
		ConfigService.layer,
		PetRepository.layer,
		PetFoodRepository.layer,
		UserRepository.layer,
	).pipe(Layer.provideMerge(database));
	const dependencies = Layer.mergeAll(
		persistence,
		ConversationPersistenceLive.pipe(Layer.provideMerge(redis.layer)),
	);
	const appLayer = PetFoodService.layer.pipe(Layer.provideMerge(dependencies));
	const makeRuntime = () => ManagedRuntime.make(Layer.fresh(appLayer));
	let runtime = makeRuntime();
	const run = <A, E>(
		effect: Effect.Effect<A, E, Layer.Success<typeof appLayer>>,
	) => runtime.runPromise(effect);
	// Unused application services remain absent, so unexpected work fails loudly.
	const execute = run as Execute<AppServices>;
	const sql = (statement: string) =>
		runtime.runPromise(
			Database.Database.pipe(
				Effect.andThen((db) =>
					db.execute((client) => client.$client.executeMultiple(statement)),
				),
			),
		);
	await runtime.runPromise(Effect.scoped(syncDatabaseSchema()));
	await sql(`
		DROP TRIGGER IF EXISTS reject_food;
		DELETE FROM notification_history;
		DELETE FROM users_to_notify;
		DELETE FROM notifications;
		DELETE FROM pet_food;
		DELETE FROM pet_carers;
		DELETE FROM configs;
		DELETE FROM pets;
		DELETE FROM users;
		INSERT INTO users (id, telegram_id, first_name) VALUES
			('user-1', '1', 'Owner'), ('user-2', '2', 'Carer');
		INSERT INTO pets (id, name, owner_id) VALUES
			('pet-1', 'Luna', 'user-1'), ('pet-2', 'Theo', 'user-2');
		INSERT INTO pet_carers (id, pet_id, carer_id, status) VALUES
			('carer-1', 'pet-2', 'user-1', 'accepted');
	`);
	await runtime.runPromise(
		Effect.gen(function* () {
			const config = yield* ConfigService;
			for (const id of [petID, 'pet-2' as PetID]) {
				yield* config.setConfig('pet', 'dayStart', id, {
					hour: 4,
					timezone: 'America/Sao_Paulo',
				});
				yield* config.setConfig(
					'pet',
					'notificationDelay',
					id,
					Duration.hours(2),
				);
			}
		}),
	);
	const runner = async () => {
		const { storage } = await runtime.runPromise(ConversationPersistence);
		const telegram = createBot(execute, storage, trace.getTracer('test'));
		telegram.bot.botInfo = botInfo;
		return { ...createGrammyRunner(telegram.bot), telegramBot: telegram };
	};
	let updateID = 1;
	const message = (text: string, owner = 1, time = now) =>
		({
			update_id: updateID++,
			message: {
				message_id: updateID,
				date: time / 1000,
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
	const callback = (data = 'values-0', owner = 1) =>
		({
			update_id: updateID++,
			callback_query: {
				id: `callback-${updateID}`,
				from: { id: owner, is_bot: false, first_name: 'Test' },
				chat_instance: `chat-${owner}`,
				data,
				message: {
					message_id: 1,
					date: now / 1000,
					chat: { id: owner, type: 'private', first_name: 'Test' },
					text: 'Choose',
				},
			},
		}) satisfies Update;
	const foods = () =>
		runtime.runPromise(
			Database.Database.pipe(
				Effect.andThen((db) =>
					db.execute((client) =>
						client
							.select()
							.from(petFoodTable)
							.orderBy(petFoodTable.petID, petFoodTable.time),
					),
				),
			),
		);
	return {
		runner,
		message,
		callback,
		foods,
		redis,
		sql,
		run,
		context: () => runtime.context(),
		restart: async () => {
			await runtime.dispose();
			runtime = makeRuntime();
		},
		close: async () => {
			await runtime.dispose();
			redis.close();
			anchor.close();
		},
	};
};

describe('registered food flows with SQLite and test Redis', () => {
	let app: Awaited<ReturnType<typeof setup>>;
	beforeEach(async () => {
		app = await setup();
	});
	afterEach(async () => {
		await app?.close();
	});

	it('adds food to owned and cared pets with persisted quantities, timestamps, and jobs', async () => {
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g -5min'));
		const foods = await app.foods();
		expect(
			foods.map(({ petID, quantity, time }) => ({ petID, quantity, time })),
		).toEqual([
			{ petID: 'pet-1', quantity: 25, time: new Date(now - 300_000) },
			{ petID: 'pet-2', quantity: 25, time: new Date(now - 300_000) },
		]);
		for (const food of foods)
			expect(app.redis.jobs.get(food.id)).toEqual({
				petID: food.petID,
				runAt: now - 300_000 + 7_200_000,
			});
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: [
						'Foram adicionados 25 g de ração para todos os seus pets',
						'Luna: 23/11/2026, 12:55:00',
						'Theo: 23/11/2026, 12:55:00',
					].join('\n'),
				}),
			}),
		);
	});

	it.each([
		{
			input: '/todos 25g',
			times: ['2026-11-23T16:00:00Z', '2026-11-23T16:00:00Z'],
			displayedTimes: [],
		},
		{
			input: '/todos 25g -800min',
			times: ['2026-11-23T02:40:00Z', '2026-11-23T02:40:00Z'],
			displayedTimes: ['22/11/2026, 23:40:00', '23/11/2026, 02:40:00'],
		},
		{
			input: '/todos 25g 08:15',
			times: ['2026-11-23T11:15:00Z', '2026-11-23T08:15:00Z'],
			displayedTimes: ['23/11/2026, 08:15:00', '23/11/2026, 08:15:00'],
		},
		{
			input: '/todos 25g 22/11/2026 08:15',
			times: ['2026-11-22T11:15:00Z', '2026-11-22T08:15:00Z'],
			displayedTimes: ['22/11/2026, 08:15:00', '22/11/2026, 08:15:00'],
		},
	])(
		'groups $input by recipient, showing times only for custom times without timezone labels',
		async ({ input, times, displayedTimes }) => {
			await app.sql(`
			INSERT INTO users (id, telegram_id, first_name) VALUES
				('user-3', '3', 'Shared carer'), ('user-4', '4', 'Partial carer'),
				('user-5', '5', 'Pending carer');
			INSERT INTO pet_carers (id, pet_id, carer_id, status) VALUES
				('carer-2', 'pet-1', 'user-2', 'accepted'),
				('carer-3', 'pet-1', 'user-3', 'accepted'),
				('carer-4', 'pet-2', 'user-3', 'accepted'),
				('carer-5', 'pet-1', 'user-4', 'pending'),
				('carer-6', 'pet-2', 'user-4', 'accepted'),
				('carer-7', 'pet-1', 'user-5', 'pending');
		`);
			await app.run(
				ConfigService.pipe(
					Effect.andThen((config) =>
						config.setConfig('pet', 'dayStart', 'pet-2' as PetID, {
							hour: 4,
							timezone: 'UTC',
						}),
					),
				),
			);
			const bot = await app.runner();
			await bot.dispatch(app.message(input));

			const lines = ['Luna', 'Theo'].map(
				(name, index) =>
					`• ${name}: 25 g` +
					(displayedTimes[index] ? ` às ${displayedTimes[index]}` : ''),
			);
			const notifications = bot.calls.filter(
				(call) =>
					call.method === 'sendMessage' &&
					'disable_notification' in call.payload,
			);
			expect(notifications).toHaveLength(3);
			for (const [chatID, text] of [
				['2', ['Owner colocou ração para os pets:', ...lines].join('\n')],
				['3', ['Owner colocou ração para os pets:', ...lines].join('\n')],
				['4', ['Owner colocou ração para os pets:', lines[1]].join('\n')],
			]) {
				expect(notifications).toContainEqual({
					method: 'sendMessage',
					payload: {
						chat_id: chatID,
						text,
						disable_notification: true,
					},
				});
			}
			expect(bot.calls).toContainEqual(
				expect.objectContaining({
					method: 'sendMessage',
					payload: expect.objectContaining({
						chat_id: 1,
						text: [
							'Foram adicionados 25 g de ração para todos os seus pets',
							...displayedTimes.map((time, index) =>
								index === 0 ? `Luna: ${time}` : `Theo: ${time}`,
							),
						].join('\n'),
					}),
				}),
			);
			const foods = await app.foods();
			expect(foods.map((food) => food.time)).toEqual(
				times.map((time) => new Date(time)),
			);
			for (const food of foods) {
				expect(app.redis.jobs.get(food.id)?.runAt).toBe(
					food.time.getTime() + 7_200_000,
				);
			}
		},
	);

	it('notifies only saved feedings when another pet has a duplicate entry', async () => {
		await app.sql(`
			INSERT INTO users (id, telegram_id, first_name) VALUES ('user-3', '3', 'Shared carer');
			INSERT INTO pet_carers (id, pet_id, carer_id, status) VALUES
				('carer-2', 'pet-1', 'user-3', 'accepted'),
				('carer-3', 'pet-2', 'user-3', 'accepted');
		`);
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 41g', 2));
		bot.calls.length = 0;
		await bot.dispatch(app.message('/todos 25g'));
		expect(
			(await app.foods()).map(({ petID, quantity }) => ({ petID, quantity })),
		).toEqual([
			{ petID: 'pet-1', quantity: 25 },
			{ petID: 'pet-2', quantity: 41 },
		]);
		expect(
			bot.calls.filter(
				(call) =>
					call.method === 'sendMessage' &&
					'disable_notification' in call.payload,
			),
		).toEqual([
			{
				method: 'sendMessage',
				payload: {
					chat_id: '3',
					text: 'Owner colocou ração para os pets:\n• Luna: 25 g',
					disable_notification: true,
				},
			},
		]);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: expect.stringContaining('Ignorando entrada'),
				}),
			}),
		);
		expect(bot.calls.some((call) => call.method === 'setMessageReaction')).toBe(
			false,
		);
	});

	it('keeps single-pet notifications unchanged with an adjusted time', async () => {
		await app.sql(`INSERT INTO pet_carers (id, pet_id, carer_id, status)
			VALUES ('carer-2', 'pet-1', 'user-2', 'accepted');`);
		const bot = await app.runner();
		await bot.dispatch(app.message('/colocar_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.message('32g -5min'));
		expect(
			bot.calls.filter(
				(call) =>
					call.method === 'sendMessage' &&
					'disable_notification' in call.payload,
			),
		).toEqual([
			{
				method: 'sendMessage',
				payload: {
					chat_id: '2',
					text: 'Owner colocou 32 g de ração para o pet Luna. A ração foi adicionada às 23/11/2026, 12:55:00',
					disable_notification: true,
				},
			},
		]);
	});

	it('completes add, correct, and delete conversations through persisted callbacks', async () => {
		const bot = await app.runner();
		await bot.dispatch(app.message('/colocar_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.message('not a quantity'));
		expect(await app.foods()).toEqual([]);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: 'Envie a quantidade de ração colocada',
				}),
			}),
		);
		await bot.dispatch(app.message('32g'));
		const [food] = await app.foods();
		expect(food).toMatchObject({ petID, quantity: 32, time: new Date(now) });
		expect(app.redis.jobs.get(food!.id)?.runAt).toBe(now + 7_200_000);
		await bot.dispatch(app.message('/corrigir_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.callback());
		await bot.dispatch(app.message('19g -10min'));
		expect(await app.foods()).toEqual([
			expect.objectContaining({
				id: food!.id,
				quantity: 19,
				time: new Date(now - 600_000),
			}),
		]);
		expect(app.redis.jobs.get(food!.id)?.runAt).toBe(now - 600_000 + 7_200_000);
		await bot.dispatch(app.message('/deletar_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.callback());
		expect(await app.foods()).toEqual([]);
		expect(app.redis.jobs.size).toBe(0);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: 'Ração deletada com sucesso!',
				}),
			}),
		);
	});

	it('resumes a food conversation after runtime restart without repeating the write', async () => {
		let bot = await app.runner();
		await bot.dispatch(app.message('/colocar_racao'));
		await bot.dispatch(app.callback());
		expect(app.redis.values.size).toBeGreaterThan(0);
		await app.restart();
		bot = await app.runner();
		await bot.dispatch(app.message('17g'));
		expect(await app.foods()).toEqual([
			expect.objectContaining({ quantity: 17 }),
		]);
		await app.restart();
		expect(await app.foods()).toHaveLength(1);
		expect(app.redis.jobs.size).toBe(1);
	});

	it('reports saved food and failed reminders for every pet without automatic replay on restart', async () => {
		const bot = await app.runner();
		app.redis.setQueueAvailable(false);
		await bot.dispatch(app.message('/todos 21g'));
		expect((await app.foods()).map((food) => food.quantity)).toEqual([21, 21]);
		for (const name of ['Luna', 'Theo']) {
			expect(bot.calls).toContainEqual(
				expect.objectContaining({
					method: 'sendMessage',
					payload: expect.objectContaining({
						text: expect.stringContaining(
							`A ração foi salva para ${name}, mas não foi possível atualizar o lembrete.`,
						),
					}),
				}),
			);
		}
		expect(app.redis.jobs.size).toBe(0);
		await app.restart();
		app.redis.setQueueAvailable(true);
		expect(await app.foods()).toHaveLength(2);
		expect(app.redis.jobs.size).toBe(0);
		await expect(
			app.run(
				PetFoodService.pipe(
					Effect.andThen((service) =>
						service.setNotificationDelayAndReschedule(petID, Duration.hours(3)),
					),
				),
			),
		).resolves.toBeNull();
		const [food] = await app.foods();
		expect(app.redis.jobs.get(food!.id)?.runAt).toBe(now + 10_800_000);
	});

	it('reports a saved feeding and failed reminder in the add-food conversation', async () => {
		const bot = await app.runner();
		app.redis.setQueueAvailable(false);
		await bot.dispatch(app.message('/colocar_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.message('27g'));
		expect(await app.foods()).toEqual([
			expect.objectContaining({ petID, quantity: 27 }),
		]);
		expect(app.redis.jobs.size).toBe(0);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: expect.stringContaining(
						'A ração foi salva para Luna, mas não foi possível atualizar o lembrete.',
					),
				}),
			}),
		);
		await app.restart();
		const restarted = await app.runner();
		await restarted.dispatch(app.message('27g'));
		expect(await app.foods()).toHaveLength(1);
	});

	it.each(['correct', 'delete', 'delay', 'disable'] as const)(
		'reports a committed %s change when updating its reminder fails',
		async (operation) => {
			const bot = await app.runner();
			await bot.dispatch(app.message('/todos 25g'));
			const jobs = [...app.redis.jobs];
			app.redis.setQueueAvailable(false);
			if (operation === 'correct' || operation === 'delete') {
				await bot.dispatch(
					app.message(
						operation === 'correct' ? '/corrigir_racao' : '/deletar_racao',
					),
				);
				await bot.dispatch(app.callback());
				await bot.dispatch(app.callback());
				if (operation === 'correct') {
					await bot.dispatch(app.message('19g -10min'));
					expect((await app.foods())[0]).toMatchObject({
						petID,
						quantity: 19,
						time: new Date(now - 600_000),
					});
				} else {
					expect((await app.foods()).map((food) => food.petID)).toEqual([
						'pet-2',
					]);
				}
			} else {
				await bot.dispatch(app.message('/configurar_atraso_notificacao'));
				await bot.dispatch(app.callback());
				await bot.dispatch(
					app.callback(operation === 'delay' ? 'values-0' : 'values-1'),
				);
				if (operation === 'delay') {
					await bot.dispatch(app.message('3 hours'));
					const delay = await app.run(
						ConfigService.pipe(
							Effect.andThen((config) =>
								config.getConfig('pet', 'notificationDelay', petID),
							),
						),
					);
					expect(Duration.toMillis(delay)).toBe(10_800_000);
				} else {
					await bot.dispatch(app.callback());
					await expect(
						app.run(
							ConfigService.pipe(
								Effect.andThen((config) =>
									config.getConfig('pet', 'notificationDelay', petID),
								),
							),
						),
					).rejects.toMatchObject({ _tag: 'MissingConfigError' });
				}
			}
			const warning = {
				correct:
					'A ração foi alterada, mas não foi possível atualizar o lembrete.',
				delete:
					'A ração foi excluída, mas não foi possível cancelar o lembrete.',
				delay:
					'O atraso de notificação foi salvo, mas não foi possível atualizar o lembrete.',
				disable:
					'O atraso de notificação foi excluído, mas não foi possível cancelar o lembrete.',
			}[operation];
			expect(bot.calls.at(-1)).toMatchObject({
				method: 'sendMessage',
				payload: { text: expect.stringContaining(warning) },
			});
			expect([...app.redis.jobs]).toEqual(jobs);
		},
	);

	it('does not update reminders or report success when SQLite rejects a feeding', async () => {
		await app.sql(
			`CREATE TRIGGER reject_food BEFORE INSERT ON pet_food BEGIN SELECT RAISE(ABORT, 'test rejection'); END;`,
		);
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g'));
		expect(await app.foods()).toEqual([]);
		expect(app.redis.jobs.size).toBe(0);
		expect(bot.calls.some((call) => call.method === 'setMessageReaction')).toBe(
			false,
		);
		await app.sql('DROP TRIGGER reject_food;');
		await bot.dispatch(app.message('/todos 13g'));
		expect((await app.foods()).map((food) => food.quantity)).toEqual([13, 13]);
		expect(app.redis.jobs.size).toBe(2);
	});

	it('handles simultaneous writes from different chats without losing either entry', async () => {
		const bot = await app.runner();
		await Promise.all([
			bot.dispatch(app.message('/todos 23g', 1)),
			bot.dispatch(app.message('/todos 41g', 2, now + 120_000)),
		]);
		const foods = await app.foods();
		expect(foods).toHaveLength(3);
		expect(
			foods
				.filter((food) => food.petID === 'pet-2')
				.map((food) => food.quantity),
		).toEqual([23, 41]);
		expect(app.redis.jobs.size).toBe(2);
	});

	it('does not delete food or its job when selection is cancelled', async () => {
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g'));
		const before = await app.foods();
		const jobs = [...app.redis.jobs];
		await bot.dispatch(app.message('/deletar_racao'));
		await bot.dispatch(app.callback());
		await bot.dispatch(app.callback('Cancelar'));
		expect(await app.foods()).toEqual(before);
		expect([...app.redis.jobs]).toEqual(jobs);
	});

	it('rejects repeated food entries without creating extra records or jobs', async () => {
		const bot = await app.runner();
		await Promise.all([
			bot.dispatch(app.message('/todos 25g', 1)),
			bot.dispatch(app.message('/todos 25g', 2)),
		]);
		const before = await app.foods();
		const jobs = [...app.redis.jobs];
		expect(before).toHaveLength(2);
		expect(jobs).toHaveLength(2);
		await bot.dispatch(app.message('/todos 25g'));
		expect(await app.foods()).toEqual(before);
		expect([...app.redis.jobs]).toEqual(jobs);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: expect.stringContaining('Ignorando entrada'),
				}),
			}),
		);
	});

	it('removes the legacy outbox without losing food, pets, users, configuration, or queued jobs', async () => {
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g'));
		const before = await app.foods();
		const jobs = [...app.redis.jobs];
		await app.sql(
			"CREATE TABLE pet_food_scheduling_outbox (id TEXT PRIMARY KEY); INSERT INTO pet_food_scheduling_outbox VALUES ('pending-intent');",
		);
		await app.restart();
		await app.run(Effect.scoped(syncDatabaseSchema()));
		expect(await app.foods()).toEqual(before);
		expect([...app.redis.jobs]).toEqual(jobs);
		const legacyTable = await app.run(
			Database.Database.pipe(
				Effect.andThen((db) =>
					db.execute((client) =>
						client.$client.execute(
							"SELECT name FROM sqlite_master WHERE name = 'pet_food_scheduling_outbox'",
						),
					),
				),
			),
		);
		expect(legacyTable.rows).toEqual([]);
		const restartedBot = await app.runner();
		await restartedBot.dispatch(app.message('/todos 31g', 1, now + 120_000));
		expect(await app.foods()).toHaveLength(4);
		expect(app.redis.jobs.size).toBe(2);
	});

	it('reports unavailable dependencies through readiness while preserving liveness', async () => {
		const { telegramBot } = await app.runner();
		const health = createTestHttp(
			HealthLive.pipe(
				Layer.provide(Layer.effectContext(Effect.promise(() => app.context()))),
				Layer.provide(Layer.succeed(TelegramBot, telegramBot)),
			),
		);
		expect((await health.request('/api/readyz')).status).toBe(200);
		app.redis.setAvailable(false);
		expect((await health.request('/api/readyz')).status).toBe(503);
		expect((await health.request('/api/healthz')).status).toBe(200);
		app.redis.setAvailable(true);
		expect((await health.request('/api/readyz')).status).toBe(200);
	});

	it('rolls back interrupted SQLite transactions before a waiting read or write proceeds', async () => {
		const records = await app.run(
			Effect.gen(function* () {
				const db = yield* Database.Database;
				const inserted = yield* Deferred.make<void>();
				const transaction = yield* db
					.transaction((tx) =>
						Effect.gen(function* () {
							yield* tx((client) =>
								client.insert(petFoodTable).values({
									id: 'interrupted' as PetFoodID,
									petID,
									userID: 'user-1' as UserID,
									quantity: 99,
									time: new Date(now),
								}),
							);
							yield* Deferred.succeed(inserted, undefined);
							yield* Effect.never;
						}),
					)
					.pipe(Effect.forkChild);
				yield* Deferred.await(inserted);
				const readStarted = yield* Deferred.make<void>();
				const read = yield* Deferred.succeed(readStarted, undefined).pipe(
					Effect.andThen(
						db.execute((client) => client.select().from(petFoodTable)),
					),
					Effect.forkChild,
				);
				yield* Deferred.await(readStarted);
				yield* Fiber.interrupt(transaction);
				return yield* Fiber.join(read);
			}),
		);
		expect(records).toEqual([]);
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 18g'));
		expect((await app.foods()).map((food) => food.quantity)).toEqual([18, 18]);
	});
});
