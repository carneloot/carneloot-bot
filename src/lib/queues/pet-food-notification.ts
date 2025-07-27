import { Queue, Worker } from 'bullmq';
import {
	Array as A,
	Console,
	Data as D,
	DateTime,
	Duration,
	Effect,
	Option,
	pipe,
	Redacted
} from 'effect';
import { Bot } from 'grammy';
import Qty from 'js-quantities';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { runtime } from '../../runtime.js';
import type { PetFoodID, PetID } from '../database/schema.js';
import { ConfigService } from '../entities/config.js';
import { getPetByID, getPetCarers } from '../entities/pet.js';
import { redis } from '../redis/redis.js';
import { PetFoodRepository } from '../repositories/pet-food.js';
import { NotificationService } from '../services/notification.js';

const QUEUE_NAME = 'pet-food-notification';

type Data = {
	petID: PetID;
};

class MissingPetId extends D.TaggedError('MissingPetId') {}

class QueueError extends D.TaggedError('QueueError')<{ message: string }> {}

export class PetFoodNotificationQueue extends Effect.Service<PetFoodNotificationQueue>()(
	'app/PetFoodNotificationQueue',
	{
		dependencies: [
			ConfigService.Default,
			PetFoodRepository.Default,
			NotificationService.Default
		],
		scoped: Effect.gen(function* () {
			const petFoodRepository = yield* PetFoodRepository;
			const notificationService = yield* NotificationService;
			const config = yield* ConfigService;

			const queue = yield* Effect.acquireRelease(
				Effect.sync(
					() =>
						new Queue<Data>(QUEUE_NAME, {
							connection: redis,
							defaultJobOptions: {
								attempts: 3,
								backoff: {
									type: 'exponential',
									delay: Duration.toMillis('10 second')
								}
							}
						})
				).pipe(
					Effect.tap(() => Effect.log('PetFoodNotificationQueue created'))
				),
				(queue) =>
					Effect.promise(() => queue.close()).pipe(
						Effect.tap(() => Effect.log('PetFoodNotificationQueue closed'))
					)
			);

			const handler = Effect.fn('PetFoodNotificationQueue.handler')(function* (
				payload: Data,
				now: DateTime.DateTime
			) {
				yield* Effect.annotateCurrentSpan({
					pet: payload.petID
				});

				const pet = yield* Effect.tryPromise(() =>
					getPetByID(payload.petID, { withOwner: true })
				).pipe(
					Effect.withSpan('getPetByID'),
					Effect.andThen(Option.fromNullable),
					Effect.catchTag('NoSuchElementException', () =>
						Effect.fail(new MissingPetId())
					)
				);

				const dayStart = yield* config.getConfig(
					'pet',
					'dayStart',
					payload.petID
				);

				const { from, to } = getDailyFromTo(now, dayStart);

				const dailyConsumption =
					yield* petFoodRepository.getDailyFoodConsumption({
						petID: payload.petID,
						from,
						to
					});

				const carers = yield* Effect.tryPromise(() =>
					getPetCarers(payload.petID)
				).pipe(
					Effect.withSpan('getPetCarers'),
					Effect.catchAll(() =>
						Effect.zipRight(
							Console.warn('Error getting pet carers'),
							Effect.succeed([] as Awaited<ReturnType<typeof getPetCarers>>)
						)
					),
					Effect.andThen(A.filter((carer) => carer.status === 'accepted'))
				);

				const bot = new Bot<Context>(Redacted.value(Env.BOT_TOKEN));

				const quantity = Option.map(dailyConsumption, (v) => Qty(v.total, 'g'));

				const message = [
					`🚨 Hora de dar comida para o pet ${pet.name}.`,
					Option.match(quantity, {
						onSome: (q) => `Já foram ${q} hoje.`,
						onNone: () => 'Ainda não foi dado comida hoje.'
					})
				].join(' ');

				yield* Effect.forEach(
					[{ carer: pet.owner }, ...carers],
					({ carer }) =>
						notificationService.sendNotificationAndLog({
							bot,
							messageText: message,
							user: carer,
							petID: payload.petID
						}),
					{ concurrency: 'unbounded' }
				);
			});

			const scheduleJob = Effect.fn('PetFoodNotificationQueue.scheduleJob')(
				function* (jobId: PetFoodID, data: Data, timeToRun: DateTime.DateTime) {
					const now = yield* DateTime.now;

					const shouldRunNow = DateTime.greaterThan(now, timeToRun);

					if (shouldRunNow) {
						yield* handler(data, now);
						return;
					}

					const delay = timeToRun.pipe(
						DateTime.distanceDuration(now),
						Duration.toMillis,
						(d) => Math.max(d, 0)
					);

					yield* Effect.tryPromise({
						try: () =>
							queue.add(`pet-${data.petID}`, data, {
								jobId,
								delay
							}),
						catch: () => new QueueError({ message: 'Failed to add to queue' })
					});
				}
			);

			const removeFromQueue = (petFoodID: PetFoodID) =>
				Effect.tryPromise({
					try: () => queue.remove(petFoodID),
					catch: () =>
						new QueueError({ message: 'Failed to remove from queue' })
				}).pipe(Effect.withSpan('PetFoodNotificationQueue.removeFromQueue'));

			yield* Effect.acquireRelease(
				Effect.sync(
					() =>
						new Worker<Data>(
							queue.name,
							async (job) => {
								const now = pipe(
									job.processedOn,
									Option.fromNullable,
									Option.andThen(DateTime.make),
									Option.getOrElse(() => DateTime.unsafeNow())
								);

								await runtime.runPromise(handler(job.data, now));
							},
							{
								connection: redis
							}
						)
				).pipe(
					Effect.tap(() =>
						Effect.log('PetFoodNotificationQueue worker created')
					)
				),
				(worker) =>
					Effect.promise(() => worker.close()).pipe(
						Effect.tap(() =>
							Effect.log('PetFoodNotificationQueue worker closed')
						)
					)
			);

			return {
				scheduleJob,
				removeFromQueue
			} as const;
		})
	}
) {}
