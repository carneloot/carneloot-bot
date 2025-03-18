import { type Processor, Queue, Worker } from 'bullmq';

import { Duration, Effect, Either, Option } from 'effect';
import { Bot } from 'grammy';
import Qty from 'js-quantities';

import { connection } from './connection.js';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
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

const handler: Processor<Data> = async (job) => {
	const payload = job.data;

	const pet = await getPetByID(payload.petID, { withOwner: true });

	if (!pet) {
		throw new Error(`Pet ${payload.petID} not found`);
	}

	const dayStart = await getConfig('pet', 'dayStart', payload.petID);

	if (!dayStart) {
		throw new Error(`Missing day start for pet ${payload.petID}`);
	}

	const nowUtc = job.processedOn ? new Date(job.processedOn) : new Date();
	const { from, to } = getDailyFromTo(nowUtc, dayStart);

	const dailyConsumption = await getDailyFoodConsumption(
		payload.petID,
		from,
		to
	);

	const carers = await getPetCarers(payload.petID).then((carers) =>
		carers.filter((carer) => carer.status === 'accepted')
	);

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
		const sentMessage = await Effect.tryPromise({
			try: () => bot.api.sendMessage(carer.telegramID, message),
			catch: (err) =>
				console.error(
					`Error sending notification to ${getUserDisplay(carer)}`,
					err
				)
		}).pipe(Effect.either, Effect.runPromise);

		if (Either.isRight(sentMessage)) {
			await createNotificationHistory({
				messageID: sentMessage.right.message_id,
				userID: carer.id,
				petID: payload.petID,
				notificationID: null
			});
		}
	}
};

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
