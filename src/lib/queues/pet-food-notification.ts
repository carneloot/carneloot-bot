import { type Processor, Queue, Worker } from 'bullmq';

import { Duration } from 'effect';
import { Bot } from 'grammy';
import Qty from 'js-quantities';

import { connection } from './connection.js';

import { Env } from '../../common/env.js';
import type { Context } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
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

	const quantity = dailyConsumption ? Qty(dailyConsumption.total, 'g') : null;

	const message = [
		`🚨 Hora de dar comida para o pet ${pet.name}.`,
		!!quantity && `Já foram ${quantity} hoje.`,
		!quantity && 'Ainda não foi dado comida hoje.'
	]
		.filter(Boolean)
		.join(' ');

	// No need to wrap in io.runTask anymore
	for (const { carer } of [{ carer: pet.owner }, ...carers]) {
		const sentMessage = await bot.api.sendMessage(carer.telegramID, message);

		await createNotificationHistory({
			messageID: sentMessage.message_id,
			userID: carer.id,
			petID: payload.petID,
			notificationID: null
		});
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
