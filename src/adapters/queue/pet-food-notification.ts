import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import {
	Context as EffectContext,
	Data as D,
	DateTime,
	Duration,
	Effect,
	FiberSet,
	Layer,
	Option,
	pipe,
} from 'effect';
import Qty from 'js-quantities';

import { Env } from '../../common/env.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getDelayUntil } from '../../common/utils/get-delay-until.js';
import type { PetFoodID, PetID } from '../../lib/database/schema.js';
import { ConfigService } from '../../lib/entities/config.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { PetRepository } from '../../lib/repositories/pet.js';
import { NotificationService } from '../../lib/services/notification.js';

const QUEUE_NAME = 'pet-food-notification';

const getQueueConnection = (): ConnectionOptions => {
	const redisUrl = new URL(Env.REDIS_URL);

	return {
		host: redisUrl.hostname,
		port: Number.parseInt(redisUrl.port, 10),
		username: redisUrl.username || undefined,
		password: redisUrl.password || undefined,
		maxRetriesPerRequest: null,
	};
};

const getJobName = (petID: PetID): string => `pet-${petID}`;

type Data = {
	petID: PetID;
};

class MissingPetId extends D.TaggedError('MissingPetId') {}

export class QueueError extends D.TaggedError('QueueError')<{
	message: string;
}> {}

export class PetFoodNotificationQueue extends EffectContext.Service<PetFoodNotificationQueue>()(
	'app/PetFoodNotificationQueue',
	{
		make: Effect.gen(function* () {
			const petFoodRepository = yield* PetFoodRepository;
			const petRepository = yield* PetRepository;
			const notificationService = yield* NotificationService;
			const config = yield* ConfigService;
			const queueConnection = getQueueConnection();
			const execute = yield* FiberSet.makeRuntimePromise();

			const queue = yield* Effect.acquireRelease(
				Effect.sync(
					() =>
						new Queue<Data, void, string>(QUEUE_NAME, {
							connection: queueConnection,
							defaultJobOptions: {
								attempts: 3,
								backoff: {
									type: 'exponential',
									delay: Duration.toMillis('10 second'),
								},
							},
						}),
				).pipe(
					Effect.tap(() => Effect.log('PetFoodNotificationQueue created')),
				),
				(queue) =>
					Effect.promise(() => queue.close()).pipe(
						Effect.tap(() => Effect.log('PetFoodNotificationQueue closed')),
					),
			);

			const handler = Effect.fn('PetFoodNotificationQueue.handler')(function* (
				payload: Data,
				now: DateTime.DateTime,
			) {
				yield* Effect.annotateCurrentSpan({
					pet: payload.petID,
				});

				const pet = yield* petRepository
					.getPetByIDWithOwner(payload.petID)
					.pipe(
						Effect.flatMap(Effect.fromOption),
						Effect.catchTag('NoSuchElementError', () =>
							Effect.fail(new MissingPetId()),
						),
					);

				const dayStart = yield* config.getConfig(
					'pet',
					'dayStart',
					payload.petID,
				);

				const { from, to } = getDailyFromTo(now, dayStart);

				const dailyConsumption =
					yield* petFoodRepository.getDailyFoodConsumption({
						petID: payload.petID,
						from,
						to,
					});

				const carers = yield* petRepository.getPetCarers(payload.petID).pipe(
					Effect.tapError(() =>
						Effect.sync(() => console.warn('Error getting pet carers')),
					),
					Effect.orElseSucceed(() => []),
					Effect.map((carers) =>
						carers.filter((carer) => carer.status === 'accepted'),
					),
				);

				const quantity = Option.map(dailyConsumption, (v) => Qty(v.total, 'g'));

				const message = [
					`🚨 Hora de dar comida para o pet ${pet.name}.`,
					Option.match(quantity, {
						onSome: (q) => `Já foram ${q} hoje.`,
						onNone: () => 'Ainda não foi dado comida hoje.',
					}),
				].join(' ');

				yield* Effect.forEach(
					[{ carer: pet.owner }, ...carers],
					({ carer }) =>
						notificationService.sendNotificationAndLog({
							messageText: message,
							user: carer,
							petID: payload.petID,
						}),
					{ concurrency: 'unbounded' },
				);
			});

			const scheduleJob = Effect.fn('PetFoodNotificationQueue.scheduleJob')(
				function* (jobId: PetFoodID, data: Data, timeToRun: DateTime.DateTime) {
					const now = yield* DateTime.now;

					const shouldRunNow = DateTime.isGreaterThan(now, timeToRun);

					if (shouldRunNow) {
						yield* handler(data, now);
						return;
					}

					const delay = getDelayUntil(now, timeToRun);

					yield* Effect.tryPromise({
						try: () =>
							queue.add(getJobName(data.petID), data, {
								jobId,
								delay,
							}),
						catch: () => new QueueError({ message: 'Failed to add to queue' }),
					});
				},
			);

			const removeFromQueue = (petFoodID: PetFoodID) =>
				Effect.tryPromise({
					try: () => queue.remove(petFoodID),
					catch: () =>
						new QueueError({ message: 'Failed to remove from queue' }),
				}).pipe(Effect.withSpan('PetFoodNotificationQueue.removeFromQueue'));

			const worker = yield* Effect.acquireRelease(
				Effect.sync(
					() =>
						new Worker<Data, void, string>(
							queue.name,
							async (job) => {
								const now = pipe(
									job.processedOn,
									Option.fromNullishOr,
									Option.andThen(DateTime.make),
									Option.getOrElse(() => DateTime.makeUnsafe(new Date())),
								);

								await execute(
									handler(job.data, now).pipe(
										Effect.withSpan('pet-food-notification-queue.job', {
											attributes: {
												'queue.job.id': job.id ?? 'unknown',
												'queue.job.name': job.name,
												'queue.job.attempts.made': job.attemptsMade,
											},
										}),
									),
								);
							},
							{
								connection: queueConnection,
							},
						),
				).pipe(
					Effect.tap(() =>
						Effect.log('PetFoodNotificationQueue worker created'),
					),
				),
				(worker) =>
					Effect.promise(() => worker.close()).pipe(
						Effect.tap(() =>
							Effect.log('PetFoodNotificationQueue worker closed'),
						),
					),
			);

			worker.on('error', (error) => {
				void execute(
					Effect.logError('PetFoodNotificationQueue worker error', error),
				).catch(() => undefined);
			});

			const checkHealth = Effect.all([
				Effect.tryPromise(() => queue.waitUntilReady()),
				Effect.tryPromise(() => worker.waitUntilReady()),
			]).pipe(
				Effect.asVoid,
				Effect.withSpan('pet-food-notification-queue.health'),
			);

			return {
				scheduleJob,
				removeFromQueue,
				checkHealth,
			} as const;
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(NotificationService.layer),
		Layer.provide(PetFoodRepository.layer),
		Layer.provide(PetRepository.layer),
		Layer.provide(ConfigService.layer),
	);
}
