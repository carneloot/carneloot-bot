import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import { LibsqlError } from '@libsql/client';
import { Effect, Layer } from 'effect';
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

const createApp = () => {
	const available = {
		database: true,
		storage: true,
		queue: true,
		telegram: true,
	};
	const telegramHealth = vi.fn(async () => {
		if (!available.telegram) throw new Error('Telegram unavailable');
	});
	const app = createTestHttp(
		HealthLive.pipe(
			Layer.provide([
				Layer.mock(Database, {
					makeQuery: () => {
						throw new Error('not used');
					},
					checkHealth: () =>
						available.database
							? Effect.void
							: Effect.fail(
									new DatabaseError({
										cause: new LibsqlError('unavailable', 'SQLITE_ERROR'),
									}),
								),
				}),
				Layer.mock(ConversationPersistence, {
					storage: {
						type: 'key',
						adapter: new MemorySessionStorage<
							VersionedState<ConversationData>
						>(),
					},
					checkHealth: Effect.suspend(() =>
						available.storage ? Effect.void : Effect.fail('unavailable'),
					),
				}),
				Layer.mock(PetFoodNotificationQueue, {
					checkHealth: Effect.tryPromise(async () => {
						if (!available.queue) throw new Error('Queue unavailable');
					}),
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
	return { ...app, available, telegramHealth };
};

describe('health endpoints', () => {
	it('reports liveness without checking dependencies', async () => {
		const app = createApp();
		const response = await app.request('/api/healthz');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(app.telegramHealth).not.toHaveBeenCalled();
	});

	it.each(['database', 'storage', 'queue', 'telegram'] as const)(
		'rechecks %s health after failure and recovery without affecting liveness',
		async (dependency) => {
			const app = createApp();
			const ready = await app.request('/api/readyz');
			expect(ready.status).toBe(200);
			expect(await ready.json()).toEqual({ status: 'ready' });
			app.available[dependency] = false;
			const unavailable = await app.request('/api/readyz');
			expect(unavailable.status).toBe(503);
			expect(await unavailable.json()).toEqual({ status: 'not-ready' });
			const alive = await app.request('/api/healthz');
			expect(alive.status).toBe(200);
			expect(await alive.json()).toEqual({ status: 'ok' });
			app.available[dependency] = true;
			expect((await app.request('/api/readyz')).status).toBe(200);
		},
	);
});
