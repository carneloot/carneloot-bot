import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

const { queueClose, workerClose } = vi.hoisted(() => ({
	queueClose: vi.fn(async () => undefined),
	workerClose: vi.fn(async () => undefined),
}));

vi.mock('bullmq', () => ({
	Queue: class {
		readonly name = 'pet-food-notification';
		readonly close = queueClose;
	},
	Worker: class {
		readonly close = workerClose;
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
	it('closes BullMQ worker and queue when its scope closes', async () => {
		await Effect.runPromise(
			Effect.scoped(
				PetFoodNotificationQueue.make.pipe(Effect.provide(queueDependencies)),
			),
		);

		expect(workerClose).toHaveBeenCalledOnce();
		expect(queueClose).toHaveBeenCalledOnce();
	});
});
