import { eventTrigger } from '@trigger.dev/sdk';
import { Bot } from 'grammy';
import { z } from 'zod';

import Qty from 'js-quantities';

import { triggerClient } from './trigger-client.js';
import { PetID } from '../database/schema.js';
import { getPetByID, getPetCarers } from '../entities/pet.js';
import { getConfig } from '../entities/config.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getDailyFoodConsumption } from '../entities/pet-food.js';
import { createNotificationHistory } from '../entities/notification.js';
import { Context } from '../../common/types/context.js';
import { Env } from '../../common/env.js';

triggerClient.defineJob({
	id: 'pet-food-notification',
	name: 'Send pet food notifications',
	version: '0.0.1',
	trigger: eventTrigger({
		name: 'pet-food-notification',
		schema: z.object({
			petID: PetID
		})
	}),
	run: async (payload, io, ctx) => {
		const pet = await getPetByID(payload.petID, { withOwner: true });

		if (!pet) {
			await io.logger.error(`Pet ${payload.petID} not found`);

			return;
		}

		const dayStart = await getConfig('pet', 'dayStart', payload.petID);

		if (!dayStart) {
			await io.logger.error(`Missing day start for pet ${payload.petID}`);

			return;
		}

		const now = ctx.run.startedAt;

		const { from, to } = getDailyFromTo(now, dayStart);

		const dailyConsumption = await getDailyFoodConsumption(payload.petID, from, to);

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

		for (const { carer } of [{ carer: pet.owner }, ...carers]) {
			await io.runTask(`send-pet-notification:${carer.id}`, async () => {
				const sentMessage = await bot.api.sendMessage(carer.telegramID, message);

				await createNotificationHistory({
					messageID: sentMessage.message_id,
					userID: carer.id,
					petID: payload.petID,
					notificationID: null
				});
			});
		}
	}
});
