import { Reactions } from '@grammyjs/emoji';

import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { PetID } from '../../lib/database/schema.js';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { sendAddedFoodNotification } from '../pet-food/utils/send-added-food-notification.js';

export const handlePetFoodNotificationReply = (petID: PetID) =>
	(async (ctx) => {
		invariant(ctx.message, 'Message object not found.');
		invariant(ctx.user, 'User is not defined.');

		const dayStart = await getConfig('pet', 'dayStart', petID);

		if (!dayStart) {
			await ctx.reply(
				'Por favor, configure o horário de início do dia para o pet.'
			);
			return;
		}

		const parsePetFoodWeightAndTimeResult = parsePetFoodWeightAndTime({
			messageMatch: ctx.message.text,
			messageTime: ctx.message.date,
			timezone: dayStart.timezone
		});

		if (parsePetFoodWeightAndTimeResult.isErr()) {
			await ctx.reply(parsePetFoodWeightAndTimeResult.error);
			return;
		}

		const { quantity, time, timeChanged } =
			parsePetFoodWeightAndTimeResult.value;

		const addPetFoodResult =
			await petFoodService.addPetFoodAndScheduleNotification({
				petID,
				messageID: ctx.message.message_id,
				userID: ctx.user.id,

				time,
				quantity,
				timeChanged,

				dayStart
			});

		if (addPetFoodResult.isErr()) {
			await ctx.reply(addPetFoodResult.error);
			return;
		}

		const { message } = addPetFoodResult.value;

		await ctx.reply(message);
		await ctx.react(Reactions.thumbs_up);

		await sendAddedFoodNotification(ctx, {
			id: petID,
			quantity,
			user: ctx.user,
			time: timeChanged ? time : undefined
		});
	}) satisfies MiddlewareFn<Context>;
