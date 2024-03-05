import { Reactions } from '@grammyjs/emoji';

import { fromUnixTime } from 'date-fns';
import { MiddlewareFn } from 'grammy';
import Qty from 'js-quantities';

import { addPetFood, schedulePetFoodNotification } from '../../lib/entities/pet-food.js';
import { PetID } from '../../lib/database/schema.js';

import { Context } from '../../common/types/context.js';
import { WEIGHT_REGEX } from '../../common/constants.js';

export const handlePetFoodNotificationReply = (petID: PetID) =>
	(async (ctx) => {
		if (!ctx.message) {
			throw new Error('Message object not found.');
		}

		const quantityMatch = ctx.message.text?.match(WEIGHT_REGEX) ?? null;

		if (!quantityMatch) {
			await ctx.reply('Por favor mande um peso na mensagem', {
				reply_to_message_id: ctx.message.message_id
			});
			return;
		}

		const quantityStr = quantityMatch.at(0)!.trim();
		const quantityQty = quantityStr.match(/(mg|g|kg)$/) ? Qty(quantityStr) : Qty(`${quantityStr}g`);
		const quantity = Math.floor(quantityQty.to('g').scalar);

		const time = fromUnixTime(ctx.message.date);

		await addPetFood({
			userID: ctx.user!.id,
			petID,
			quantity,
			time
		});

		await schedulePetFoodNotification(petID, time);

		await ctx.react(Reactions.thumbs_up);
	}) satisfies MiddlewareFn<Context>;
