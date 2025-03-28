import { type Job, Queue, Worker } from 'bullmq';
import {
	Array as A,
	Console,
	Data as D,
	DateTime,
	Duration,
	Effect,
	Either,
	Option,
	Redacted,
	pipe
} from 'effect';
import { Bot } from 'grammy';
import Qty from 'js-quantities';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { runtime } from '../../runtime.js';
import type { PetID } from '../database/schema.js';
import { getConfigEffect } from '../entities/config.js';
import { createNotificationHistory } from '../entities/notification.js';
import { getPetByID, getPetCarers } from '../entities/pet.js';
import { redis } from '../redis/redis.js';
import { PetFoodRepository } from '../repositories/pet-food.js';

const QUEUE_NAME = 'pet-food-notification';

type Data = {
	petID: PetID;
};

const queue = new Queue<Data>(QUEUE_NAME, {
	connection: redis,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: Duration.toMillis('10 second')
		}
	}
});

class MissingPetId extends D.TaggedError('MissingPetId') {}

const handler = (job: Job<Data>) =>
	Effect.gen(function* () {
		const payload = job.data;

		const petFoodRepository = yield* PetFoodRepository;

		const pet = yield* Effect.tryPromise(() =>
			getPetByID(payload.petID, { withOwner: true })
		).pipe(
			Effect.andThen(Option.fromNullable),
			Effect.catchTag('NoSuchElementException', () =>
				Effect.fail(new MissingPetId())
			)
		);

		const dayStart = yield* getConfigEffect('pet', 'dayStart', payload.petID);

		const now = pipe(
			job.processedOn,
			Option.fromNullable,
			Option.andThen(DateTime.make),
			Option.getOrElse(() => DateTime.unsafeNow())
		);

		const { from, to } = getDailyFromTo(now, dayStart);

		const dailyConsumption = yield* petFoodRepository.getDailyFoodConsumption({
			petID: payload.petID,
			from,
			to
		});

		const carers = yield* Effect.tryPromise(() =>
			getPetCarers(payload.petID)
		).pipe(
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

		for (const { carer } of [{ carer: pet.owner }, ...carers]) {
			const sentMessage = yield* Effect.tryPromise({
				try: () => bot.api.sendMessage(carer.telegramID, message),
				catch: (err) =>
					console.error(
						`Error sending notification to ${getUserDisplay(carer)}`,
						err
					)
			}).pipe(Effect.either);

			if (Either.isRight(sentMessage)) {
				yield* createNotificationHistory({
					messageID: sentMessage.right.message_id,
					userID: carer.id,
					petID: payload.petID,
					notificationID: null
				}).pipe(Effect.ignoreLogged);
			}
		}
	}).pipe(runtime.runPromise);

export const petFoodNotificationJob = {
	QUEUE_NAME,
	queue,
	createWorker: () => {
		const worker = new Worker<Data>(QUEUE_NAME, handler, {
			connection: redis
		});
		worker.on('error', (err) => console.error('Error in job', err));
		worker.on('active', (job) => console.log('Job started', job.id));
		worker.on('completed', (job) => console.log('Job completed', job.id));
		return worker;
	}
};
