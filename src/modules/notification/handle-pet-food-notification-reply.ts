import { Reactions } from '@grammyjs/emoji';

import { Either } from 'effect';
import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { PetID } from '../../lib/database/schema.js';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { getPetByID } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { sendAddedFoodNotification } from '../pet-food/utils/send-added-food-notification.js';

export const handlePetFoodNotificationReply = (petID: PetID) =>
	(async (ctx) => {
		invariant(ctx.message, 'Message object not found.');
		invariant(ctx.user, 'User is not defined.');

		const pet = await getPetByID(petID);

		if (!pet) {
			await ctx.reply(
				'Pet não encontrado. Isso nunca é para acontecer, mas se acontecer, contate o dono do bot.'
			);
			return;
		}

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

		if (Either.isLeft(parsePetFoodWeightAndTimeResult)) {
			await ctx.reply(parsePetFoodWeightAndTimeResult.left);
			return;
		}

		const { quantity, time, timeChanged } =
			parsePetFoodWeightAndTimeResult.right;

		const addPetFoodResult =
			await petFoodService.addPetFoodAndScheduleNotification({
				pet,
				messageID: ctx.message.message_id,
				userID: ctx.user.id,

				time,
				quantity,
				timeChanged,

				dayStart
			});

		if (Either.isLeft(addPetFoodResult)) {
			await ctx.reply(addPetFoodResult.left);
			return;
		}

		const { message } = addPetFoodResult.right;

		await ctx.reply(message);
		await ctx.react(Reactions.thumbs_up);

		await sendAddedFoodNotification(ctx, {
			id: petID,
			quantity,
			user: ctx.user,
			time: timeChanged ? time : undefined
		});
	}) satisfies MiddlewareFn<Context>;
