import { Effect, Layer, Logger } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	queueClose,
	queueWaitUntilReady,
	workerClose,
	workerErrorHandlers,
	workerOn,
	workerWaitUntilReady,
} = vi.hoisted(() => ({
	queueClose: vi.fn(async () => undefined),
	queueWaitUntilReady: vi.fn(async () => undefined),
	workerClose: vi.fn(async () => undefined),
	workerErrorHandlers: [] as Array<(error: Error) => void>,
	workerOn: vi.fn((event: string, handler: (error: Error) => void) => {
		if (event === 'error') {
			workerErrorHandlers.push(handler);
		}
	}),
	workerWaitUntilReady: vi.fn(async () => undefined),
}));

vi.mock('bullmq', () => ({
	Queue: class {
		readonly name = 'pet-food-notification';
		readonly close = queueClose;
		readonly waitUntilReady = queueWaitUntilReady;
	},
	Worker: class {
		readonly close = workerClose;
		readonly on = workerOn;
		readonly waitUntilReady = workerWaitUntilReady;
	},
}));

process.env.BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'file:test.db';
process.env.REDIS_URL = 'redis://localhost:6379';

const { PetFoodNotificationQueue } = await import('./pet-food-notification.js');
const { ConfigService } = await import('../../lib/entities/config.js');
const { PetFoodRepository } =
	await import('../../lib/repositories/pet-food.js');
const { PetRepository } = await import('../../lib/repositories/pet.js');
const { NotificationService } =
	await import('../../lib/services/notification.js');

const unused = () => Effect.die('Not used by queue initialization');

const queueDependencies = Layer.mergeAll(
	Layer.succeed(
		PetFoodRepository,
		PetFoodRepository.of({
			getDailyFoodConsumption: unused,
			getLastPetFood: unused,
			getPetFoodByRange: unused,
			deletePetFood: unused,
			addPetFood: unused,
			getPetFoodsFromMessage: unused,
			updatePetFood: unused,
		}),
	),
	Layer.succeed(
		PetRepository,
		PetRepository.of({
			getUserOwnedPets: unused,
			getUserCaredPets: unused,
			createPet: unused,
			deletePet: unused,
			getPetByID: unused,
			getPetByIDWithOwner: unused,
			getPetCarers: unused,
			getPetCarerStatus: unused,
			addCarer: unused,
			removeCarer: unused,
			getPendingPetInvites: unused,
			answerPendingPetInvite: unused,
		}),
	),
	Layer.succeed(
		NotificationService,
		NotificationService.of({
			sendNotificationAndLog: unused,
			sendNotification: unused,
		}),
	),
	Layer.succeed(
		ConfigService,
		ConfigService.of({
			getConfig: unused,
			setConfig: unused,
			deleteConfig: unused,
		}),
	),
);

describe('PetFoodNotificationQueue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		workerErrorHandlers.length = 0;
	});

	it('closes BullMQ worker and queue when its scope closes', async () => {
		await Effect.runPromise(
			Effect.scoped(
				PetFoodNotificationQueue.make.pipe(Effect.provide(queueDependencies)),
			),
		);

		expect(workerClose).toHaveBeenCalledOnce();
		expect(queueClose).toHaveBeenCalledOnce();
	});

	it('waits for queue and worker readiness and logs worker errors', async () => {
		const { promise: workerReady, resolve: resolveWorkerReady } =
			Promise.withResolvers<undefined>();
		workerWaitUntilReady.mockReturnValueOnce(workerReady);
		const logs: Array<{
			readonly logLevel: string;
			readonly message: unknown;
		}> = [];
		const logger = Logger.make((log) => {
			logs.push(log);
		});

		let finished = false;
		const healthCheck = Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const queue = yield* PetFoodNotificationQueue.make.pipe(
						Effect.provide(queueDependencies),
					);

					yield* queue.checkHealth;
				}),
			).pipe(Effect.provide(Logger.layer([logger]))),
		).then(() => {
			finished = true;
		});

		await vi.waitFor(() => {
			expect(queueWaitUntilReady).toHaveBeenCalledOnce();
			expect(workerWaitUntilReady).toHaveBeenCalledOnce();
		});
		expect(finished).toBe(false);

		const workerError = new Error('Redis connection lost');
		workerErrorHandlers[0]?.(workerError);
		await vi.waitFor(() =>
			expect(logs).toContainEqual(
				expect.objectContaining({
					logLevel: 'Error',
					message: ['PetFoodNotificationQueue worker error', workerError],
				}),
			),
		);

		resolveWorkerReady(undefined);
		await healthCheck;
	});
});
