import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import {
	PetFoodNotificationQueue,
	QueueError,
} from '../../adapters/queue/pet-food-notification.js';
import type {
	PetFoodID,
	PetFoodSchedulingOutboxID,
	PetID,
} from '../database/schema.js';
import { PetFoodSchedulingOutboxRepository } from '../repositories/pet-food-scheduling-outbox.js';
import { reconcilePetFoodSchedulingOutbox } from './pet-food.js';

describe('pet food scheduling outbox', () => {
	it('retains a failed intent and dispatches it exactly once on later reconciliation', async () => {
		const intents = [
			{
				id: 'intent-1' as PetFoodSchedulingOutboxID,
				action: 'schedule' as const,
				petFoodID: 'food-1' as PetFoodID,
				petID: 'pet-1' as PetID,
				runAt: new Date('2025-01-02T03:04:05.000Z'),
				createdAt: new Date('2025-01-01T03:04:05.000Z'),
			},
		];
		let queueAvailable = false;
		const scheduled: Array<PetFoodID> = [];

		const dependencies = Layer.mergeAll(
			Layer.succeed(
				PetFoodSchedulingOutboxRepository,
				PetFoodSchedulingOutboxRepository.of({
					enqueue: () => Effect.die('Not used by reconciliation'),
					getPending: () => Effect.succeed(intents),
					remove: (id) =>
						Effect.sync(() => {
							const index = intents.findIndex((intent) => intent.id === id);
							if (index >= 0) intents.splice(index, 1);
						}),
				}),
			),
			Layer.succeed(
				PetFoodNotificationQueue,
				PetFoodNotificationQueue.of({
					scheduleJob: (petFoodID) =>
						queueAvailable
							? Effect.sync(() => scheduled.push(petFoodID))
							: Effect.fail(
									new QueueError({ message: 'Failed to add to queue' }),
								),
					removeFromQueue: () => Effect.succeed(0),
					checkHealth: Effect.void,
				}),
			),
		);

		const firstAttempt = await Effect.runPromise(
			Effect.exit(reconcilePetFoodSchedulingOutbox()).pipe(
				Effect.provide(dependencies),
			),
		);
		expect(firstAttempt._tag).toBe('Failure');
		expect(intents).toHaveLength(1);

		queueAvailable = true;
		await Effect.runPromise(
			reconcilePetFoodSchedulingOutbox().pipe(Effect.provide(dependencies)),
		);
		await Effect.runPromise(
			reconcilePetFoodSchedulingOutbox().pipe(Effect.provide(dependencies)),
		);

		expect(intents).toHaveLength(0);
		expect(scheduled).toEqual(['food-1']);
	});
});
