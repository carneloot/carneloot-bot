import { Reactions } from '@grammyjs/emoji';

import { MiddlewareFn } from 'grammy';
import { isAfter } from 'date-fns';

import {
	addPetFood,
	cancelPetFoodNotification,
	getLastPetFood,
	schedulePetFoodNotification
} from '../../lib/entities/pet-food.js';
import { PetID } from '../../lib/database/schema.js';

import { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';

export const handlePetFoodNotificationReply = (petID: PetID) =>
	(async (ctx) => {
		if (!ctx.message) {
			throw new Error('Message object not found.');
		}

		const result = parsePetFoodWeightAndTime(ctx.message.text, ctx.message.date);

		if (result.isErr()) {
			await ctx.reply(result.error);
			return;
		}

		const { quantity, time } = result.value;

		const lastPetFood = await getLastPetFood(petID);

		const petFood = await addPetFood({
			userID: ctx.user!.id,
			petID,
			quantity: quantity.scalar,
			time,
			messageID: ctx.message.message_id
		});

		await ctx.reply(`Foram adicionados ${quantity} de ração.`);

		if (!lastPetFood || isAfter(time, lastPetFood.time)) {
			if (lastPetFood) {
				await cancelPetFoodNotification(lastPetFood.id);
			}

			await schedulePetFoodNotification(petID, petFood.id, time);
		}

		await ctx.react(Reactions.thumbs_up);
	}) satisfies MiddlewareFn<Context>;
