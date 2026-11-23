import { createClient } from '@libsql/client';
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
import { createHealthApp } from '../../../../src/adapters/http/health.js';
import { PetFoodNotificationQueue } from '../../../../src/adapters/queue/pet-food-notification.js';
import { createBot } from '../../../../src/adapters/telegram/bot.js';
import {
	ConversationPersistence,
	ConversationPersistenceLive,
} from '../../../../src/adapters/telegram/conversation-storage.js';
import type { AppServices } from '../../../../src/app/layer.js';
import * as Database from '../../../../src/lib/database/db.js';
import {
	petFoodSchedulingOutboxTable,
	petFoodTable,
	type PetFoodID,
	type PetID,
	type UserID,
} from '../../../../src/lib/database/schema.js';
import { syncDatabaseSchema } from '../../../../src/lib/database/sync-schema.js';
import { ConfigService } from '../../../../src/lib/entities/config.js';
import { PetFoodSchedulingOutboxRepository } from '../../../../src/lib/repositories/pet-food-scheduling-outbox.js';
import { PetFoodRepository } from '../../../../src/lib/repositories/pet-food.js';
import { PetRepository } from '../../../../src/lib/repositories/pet.js';
import { UserRepository } from '../../../../src/lib/repositories/user.js';
import { PetFoodService } from '../../../../src/lib/services/pet-food.js';
import { createGrammyRunner } from '../../../support/grammy-runner.js';
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
		PetFoodSchedulingOutboxRepository.layer,
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
		DROP TRIGGER IF EXISTS reject_schedule;
		DELETE FROM notification_history;
		DELETE FROM users_to_notify;
		DELETE FROM notifications;
		DELETE FROM pet_food_scheduling_outbox;
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
		const telegram = createBot(execute, storage);
		telegram.bot.botInfo = botInfo;
		return createGrammyRunner(telegram.bot);
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
	const pending = () =>
		runtime.runPromise(
			Database.Database.pipe(
				Effect.andThen((db) =>
					db.execute((client) =>
						client.select().from(petFoodSchedulingOutboxTable),
					),
				),
			),
		);
	return {
		runner,
		message,
		callback,
		foods,
		pending,
		redis,
		sql,
		run,
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
		expect(await app.pending()).toEqual([]);
		expect(bot.calls).toContainEqual(
			expect.objectContaining({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: 'Foram adicionados 25 g de ração para todos os seus pets',
				}),
			}),
		);
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
		expect(await app.pending()).toEqual([]);
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
		await app.run(
			PetFoodService.pipe(
				Effect.andThen((service) => service.reconcileNotifications()),
			),
		);
		expect(await app.foods()).toHaveLength(1);
		expect(app.redis.jobs.size).toBe(1);
	});

	it('preserves committed food and retries pending scheduling after a Redis outage and restart', async () => {
		const bot = await app.runner();
		app.redis.setAvailable(false);
		// Direct service execution avoids failing conversation storage before the write.
		const { addFood } =
			await import('../../../../src/adapters/telegram/pet-food/operations.js');
		const { default: Qty } = await import('js-quantities');
		await expect(
			app.run(
				addFood(
					{ id: petID, name: 'Luna' },
					90,
					'user-1',
					new Date(now),
					Qty('21g'),
					false,
					{ hour: 4, timezone: 'America/Sao_Paulo' },
				),
			),
		).rejects.toMatchObject({ _tag: 'QueueError' });
		expect(await app.foods()).toEqual([
			expect.objectContaining({ quantity: 21 }),
		]);
		expect(await app.pending()).toHaveLength(1);
		expect(app.redis.jobs.size).toBe(0);
		await app.restart();
		app.redis.setAvailable(true);
		for (let i = 0; i < 2; i++)
			await app.run(
				PetFoodService.pipe(
					Effect.andThen((service) => service.reconcileNotifications()),
				),
			);
		expect(await app.foods()).toHaveLength(1);
		expect(app.redis.jobs.size).toBe(1);
		expect(await app.pending()).toEqual([]);
		expect(bot.calls).toEqual([]);
	});

	it('keeps food and scheduling intent atomic when SQLite rejects the intent', async () => {
		await app.sql(
			`CREATE TRIGGER reject_schedule BEFORE INSERT ON pet_food_scheduling_outbox BEGIN SELECT RAISE(ABORT, 'test rejection'); END;`,
		);
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g'));
		expect(await app.foods()).toEqual([]);
		expect(await app.pending()).toEqual([]);
		expect(app.redis.jobs.size).toBe(0);
		expect(bot.calls.some((call) => call.method === 'setMessageReaction')).toBe(
			false,
		);
		await app.sql('DROP TRIGGER reject_schedule;');
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
		expect(await app.pending()).toEqual([]);
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
		await bot.dispatch(app.message('/todos 25g'));
		const before = await app.foods();
		const jobs = [...app.redis.jobs];
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

	it('upgrades the main schema without losing food, pets, users, or configuration', async () => {
		const bot = await app.runner();
		await bot.dispatch(app.message('/todos 25g'));
		const before = await app.foods();
		// The only database schema addition in the rewrite is the durable outbox.
		await app.sql('DROP TABLE pet_food_scheduling_outbox;');
		await app.restart();
		await app.run(Effect.scoped(syncDatabaseSchema()));
		expect(await app.foods()).toEqual(before);
		expect(await app.pending()).toEqual([]);
		const restartedBot = await app.runner();
		await restartedBot.dispatch(app.message('/todos 31g', 1, now + 120_000));
		expect(await app.foods()).toHaveLength(4);
		expect(app.redis.jobs.size).toBe(2);
	});

	it('reports unavailable dependencies through readiness while preserving liveness', async () => {
		const health = createHealthApp(() =>
			app.run(
				Effect.gen(function* () {
					const db = yield* Database.Database;
					const storage = yield* ConversationPersistence;
					const queue = yield* PetFoodNotificationQueue;
					yield* db.checkHealth();
					yield* storage.checkHealth;
					yield* queue.checkHealth;
				}),
			),
		);
		expect((await health.request('/readyz')).status).toBe(200);
		app.redis.setAvailable(false);
		expect((await health.request('/readyz')).status).toBe(503);
		expect((await health.request('/healthz')).status).toBe(200);
		app.redis.setAvailable(true);
		expect((await health.request('/readyz')).status).toBe(200);
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
