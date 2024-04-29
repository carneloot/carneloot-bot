import { Reactions } from '@grammyjs/emoji';

import { MiddlewareFn } from 'grammy';
import { isAfter } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

import {
	addPetFood,
	cancelPetFoodNotification,
	getLastPetFood,
	schedulePetFoodNotification
} from '../../lib/entities/pet-food.js';
import { PetID } from '../../lib/database/schema.js';

import { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { sendAddedFoodNotification } from '../pet-food/utils/send-added-food-notification.js';

export const handlePetFoodNotificationReply = (petID: PetID) =>
	(async (ctx) => {
		if (!ctx.message) {
			throw new Error('Message object not found.');
		}

		const dayStart = await getConfig('pet', 'dayStart', petID);

		if (!dayStart) {
			await ctx.reply('Por favor, configure o horário de início do dia para o pet.');
			return;
		}

		const result = parsePetFoodWeightAndTime({
			messageMatch: ctx.message.text,
			messageTime: ctx.message.date,
			timezone: dayStart.timezone
		});

		if (result.isErr()) {
			await ctx.reply(result.error);
			return;
		}

		const { quantity, time, timeChanged } = result.value;

		const lastPetFood = await getLastPetFood(petID);

		const petFood = await addPetFood({
			userID: ctx.user!.id,
			petID,
			quantity: quantity.scalar,
			time,
			messageID: ctx.message.message_id
		});

		const message = [
			`Foram adicionados ${quantity} de ração.`,
			timeChanged &&
				`A ração foi adicionada para ${utcToZonedTime(time, dayStart.timezone).toLocaleString('pt-BR')}`
		]
			.filter(Boolean)
			.join(' ');

		await ctx.reply(message);

		if (!lastPetFood || isAfter(time, lastPetFood.time)) {
			if (lastPetFood) {
				await cancelPetFoodNotification(lastPetFood.id);
			}

			await schedulePetFoodNotification(petID, petFood.id, time);
		}

		await sendAddedFoodNotification(ctx, petID, quantity, ctx.user!);

		await ctx.react(Reactions.thumbs_up);
	}) satisfies MiddlewareFn<Context>;
