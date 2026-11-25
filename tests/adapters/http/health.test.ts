import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import { LibsqlError } from '@libsql/client';
import { Deferred, Effect, Layer, Tracer } from 'effect';
import { Bot, MemorySessionStorage } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { HealthLive } from '../../../src/adapters/http/health.js';
import { PetFoodNotificationQueue } from '../../../src/adapters/queue/pet-food-notification.js';
import { TelegramBot } from '../../../src/adapters/telegram/bot.js';
import { ConversationPersistence } from '../../../src/adapters/telegram/conversation-storage.js';
import type { Context } from '../../../src/common/types/context.js';
import { Database, DatabaseError } from '../../../src/lib/database/db.js';
import { createTestHttp } from '../../support/http.js';

const createApp = (beforeCheck: Effect.Effect<void> = Effect.void) => {
	const available = {
		database: true,
		storage: true,
		queue: true,
		telegram: true,
	};
	const spans: Tracer.Span[] = [];
	const tracer = Tracer.make({
		span: (options) => {
			const span = new Tracer.NativeSpan(options);
			spans.push(span);
			return span;
		},
	});
	const telegramHealth = vi.fn(async () => {
		await Effect.runPromise(beforeCheck);
		if (!available.telegram) throw new Error('Telegram unavailable');
	});
	const app = createTestHttp(
		HealthLive.pipe(
			Layer.provide([
				Layer.succeed(Tracer.Tracer, tracer),
				Layer.mock(Database, {
					makeQuery: () => {
						throw new Error('not used');
					},
					checkHealth: () =>
						Effect.andThen(beforeCheck, () =>
							available.database
								? Effect.void
								: Effect.fail(
										new DatabaseError({
											cause: new LibsqlError('unavailable', 'SQLITE_ERROR'),
										}),
									),
						),
				}),
				Layer.mock(ConversationPersistence, {
					storage: {
						type: 'key',
						adapter: new MemorySessionStorage<
							VersionedState<ConversationData>
						>(),
					},
					checkHealth: Effect.andThen(beforeCheck, () =>
						available.storage ? Effect.void : Effect.fail('unavailable'),
					),
				}),
				Layer.mock(PetFoodNotificationQueue, {
					checkHealth: Effect.andThen(
						beforeCheck,
						Effect.tryPromise(async () => {
							if (!available.queue) throw new Error('Queue unavailable');
						}),
					),
				}),
				Layer.succeed(TelegramBot, {
					bot: new Bot<Context>('123:test'),
					checkHealth: telegramHealth,
					setWebhook: async () => true,
					setCommands: async () => undefined,
				}),
			]),
		),
	);
	return { ...app, available, telegramHealth, spans };
};

describe('health endpoints', () => {
	it('reports liveness without checking dependencies', async () => {
		const app = createApp();
		const response = await app.request('/api/healthz');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(app.telegramHealth).not.toHaveBeenCalled();
	});

	it('starts every readiness check before waiting for any to complete', async () => {
		const allStarted = Deferred.makeUnsafe<void>();
		let started = 0;
		const app = createApp(
			Effect.gen(function* () {
				started++;
				if (started === 4) yield* Deferred.succeed(allStarted, undefined);
				yield* Deferred.await(allStarted);
			}).pipe(Effect.timeout('1 second'), Effect.orDie),
		);

		const response = await app.request('/api/readyz');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ready' });
		expect(started).toBe(4);
	});

	it.each(['database', 'storage', 'queue', 'telegram'] as const)(
		'rechecks %s health after failure and recovery without affecting liveness',
		async (dependency) => {
			const app = createApp();
			const ready = await app.request('/api/readyz');
			expect(ready.status).toBe(200);
			expect(await ready.json()).toEqual({ status: 'ready' });
			expect(
				app.spans.find((span) => span.name === 'telegram-bot.health'),
			).toMatchObject({
				parent: { _tag: 'Some', value: { name: 'http.readiness' } },
				status: { _tag: 'Ended', exit: { _tag: 'Success' } },
			});
			app.spans.length = 0;
			app.available[dependency] = false;
			const unavailable = await app.request('/api/readyz');
			expect(unavailable.status).toBe(503);
			expect(await unavailable.json()).toEqual({ status: 'not-ready' });
			if (dependency === 'telegram') {
				expect(
					app.spans.find((span) => span.name === 'telegram-bot.health'),
				).toMatchObject({
					status: { _tag: 'Ended', exit: { _tag: 'Failure' } },
				});
			}
			const alive = await app.request('/api/healthz');
			expect(alive.status).toBe(200);
			expect(await alive.json()).toEqual({ status: 'ok' });
			app.available[dependency] = true;
			expect((await app.request('/api/readyz')).status).toBe(200);
		},
	);
});
