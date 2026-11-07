import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

const { adapterInstances, clients, quit } = vi.hoisted(() => ({
	adapterInstances: [] as unknown[],
	clients: [] as unknown[],
	quit: vi.fn(async () => undefined),
}));

vi.mock('ioredis', () => ({
	Redis: class {
		constructor() {
			clients.push(this);
		}

		readonly quit = quit;
	},
}));

vi.mock('@grammyjs/storage-redis', () => ({
	RedisAdapter: class {
		constructor({ instance }: { instance: unknown }) {
			adapterInstances.push(instance);
		}
	},
}));

process.env.BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'file:test.db';
process.env.REDIS_URL = 'redis://localhost:6379';

const { ConversationPersistence, ConversationPersistenceLive } =
	await import('./conversation-storage.js');
const { Redis, RedisLive } = await import('../../lib/redis/redis.js');

describe('ConversationPersistenceLive', () => {
	it('uses the scoped Redis client and lets its owner close it', async () => {
		const layer = ConversationPersistenceLive.pipe(
			Layer.provideMerge(RedisLive),
		);

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const redis = yield* Redis;
					yield* ConversationPersistence;

					expect(adapterInstances).toEqual([redis.client]);
				}).pipe(Effect.provide(layer)),
			),
		);

		expect(clients).toHaveLength(1);
		expect(quit).toHaveBeenCalledOnce();
	});
});
