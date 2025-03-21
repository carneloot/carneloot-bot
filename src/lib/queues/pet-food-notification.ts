import { type Processor, Queue, Worker } from 'bullmq';

import {
	Array as A,
	Console,
	Data as D,
	Duration,
	Effect,
	Either,
	Option
} from 'effect';
import { Bot } from 'grammy';
import Qty from 'js-quantities';

import { connection } from './connection.js';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { DatabaseError } from '../database/error.js';
import type { PetID } from '../database/schema.js';
import { getConfig } from '../entities/config.js';
import { createNotificationHistory } from '../entities/notification.js';
import { getDailyFoodConsumption } from '../entities/pet-food.js';
import { getPetByID, getPetCarers } from '../entities/pet.js';

const QUEUE_NAME = 'pet-food-notification';

type Data = {
	petID: PetID;
};

const queue = new Queue<Data>(QUEUE_NAME, {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: Duration.toMillis('10 second')
		}
	}
});

class MissingPetId extends D.TaggedError('MissingPetId') {}

class MissingPetDayStart extends D.TaggedError('MissingPetDayStart') {}

const getDayStart = (petId: PetID) =>
	Effect.tryPromise({
		try: () => getConfig('pet', 'dayStart', petId),
		catch: (err) => new DatabaseError({ cause: err })
	}).pipe(
		Effect.andThen(Option.fromNullable),
		Effect.catchTag('NoSuchElementException', () =>
			Effect.fail(new MissingPetDayStart())
		)
	);

const handler: Processor<Data> = (job) =>
	Effect.gen(function* () {
		const payload = job.data;

		const pet = yield* Effect.tryPromise(() =>
			getPetByID(payload.petID, { withOwner: true })
		).pipe(
			Effect.andThen(Option.fromNullable),
			Effect.catchTag('NoSuchElementException', () =>
				Effect.fail(new MissingPetId())
			)
		);

		const dayStart = yield* getDayStart(payload.petID);

		const nowUtc = job.processedOn ? new Date(job.processedOn) : new Date();
		const { from, to } = getDailyFromTo(nowUtc, dayStart);

		const dailyConsumption = yield* Effect.tryPromise(() =>
			getDailyFoodConsumption(payload.petID, from, to)
		);

		const carers = yield* Effect.tryPromise({
			try: () => getPetCarers(payload.petID),
			catch: (err) => Console.error('Error getting pet carers', err)
		}).pipe(Effect.andThen(A.filter((carer) => carer.status === 'accepted')));

		const bot = new Bot<Context>(Env.BOT_TOKEN);

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
	}).pipe(Effect.runPromise);

export const petFoodNotificationJob = {
	QUEUE_NAME,
	queue,
	createWorker: () => {
		const worker = new Worker<Data>(QUEUE_NAME, handler, {
			connection
		});
		worker.on('error', (err) => console.error('Error in job', err));
		worker.on('active', (job) => console.log('Job started', job.id));
		worker.on('completed', (job) => console.log('Job completed', job.id));
		return worker;
	}
};
