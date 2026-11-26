import { DateTime, Effect, Layer } from 'effect';
import { Redis as IORedis } from 'ioredis';
import { vi } from 'vitest';

import {
	PetFoodNotificationQueue,
	QueueError,
} from '../../src/adapters/queue/pet-food-notification.js';
import type { PetFoodID, PetID } from '../../src/lib/database/schema.js';
import { Redis } from '../../src/lib/redis/redis.js';

// No socket is opened. The real RedisAdapter serializes conversation state
// through this client's commands, while jobs live at the queue service boundary.
export const createTestRedis = () => {
	const values = new Map<string, string>();
	const jobs = new Map<PetFoodID, { petID: PetID; runAt: number }>();
	let available = true;
	let queueAvailable = true;
	const client = new IORedis({ lazyConnect: true });
	vi.spyOn(client, 'sendCommand').mockImplementation(async (command) => {
		if (!available) throw new Error('Test Redis is unavailable');
		const key = String(command.args[0]);
		switch (command.name) {
			case 'ping':
				return 'PONG';
			case 'get':
				return values.get(key) ?? null;
			case 'set':
				if (
					command.args
						.slice(2)
						.some((arg) => String(arg).toUpperCase() === 'NX') &&
					values.has(key)
				)
					return null;
				values.set(key, String(command.args[1]));
				return 'OK';
			case 'del':
				return Number(values.delete(key));
			default:
				throw new Error(`Unsupported test Redis command: ${command.name}`);
		}
	});
	const checkHealth = Effect.tryPromise(() => client.ping()).pipe(
		Effect.asVoid,
	);
	const queueHealth = Effect.suspend(() =>
		queueAvailable
			? checkHealth.pipe(
					Effect.mapError(
						() => new QueueError({ message: 'Test Redis is unavailable' }),
					),
				)
			: Effect.fail(new QueueError({ message: 'Test queue is unavailable' })),
	);
	const queue = PetFoodNotificationQueue.of({
		checkHealth,
		scheduleJob: (id, data, time) =>
			queueHealth.pipe(
				Effect.andThen(() =>
					Effect.sync(() => {
						jobs.set(id, {
							petID: data.petID,
							runAt: DateTime.toEpochMillis(time),
						});
					}),
				),
			),
		removeFromQueue: (id) =>
			queueHealth.pipe(
				Effect.andThen(() => Effect.sync(() => Number(jobs.delete(id)))),
			),
	});
	return {
		layer: Layer.mergeAll(
			Layer.succeed(Redis, Redis.of({ client })),
			Layer.succeed(PetFoodNotificationQueue, queue),
		),
		jobs,
		values,
		setAvailable: (value: boolean) => {
			available = value;
		},
		setQueueAvailable: (value: boolean) => {
			queueAvailable = value;
		},
		close: () => client.disconnect(),
	};
};
