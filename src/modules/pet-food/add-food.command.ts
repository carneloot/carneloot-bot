import { Reactions } from '@grammyjs/emoji';

import { Either } from 'effect';
import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { sendAddedFoodNotification } from './utils/send-added-food-notification.js';

export const AddFoodCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const currentPet = await getConfig('user', 'currentPet', ctx.user.id);

	if (!currentPet) {
		await ctx.reply(
			'Você ainda não configurou o pet atual.\nUtilize o comando /escolher_pet para configurar'
		);
		return;
	}

	const dayStart = await getConfig('pet', 'dayStart', currentPet.id);

	if (!dayStart) {
		await ctx.reply(
			'Por favor, configure o horário de início do dia para o pet.'
		);
		return;
	}

	if (typeof ctx.match !== 'string') {
		await ctx.reply('Por favor, envie uma mensagem');
		return;
	}

	invariant(ctx.message, 'Message is not defined');

	const parsePetFoodWeightAndTimeResult = parsePetFoodWeightAndTime({
		messageMatch: ctx.match,
		messageTime: ctx.message.date,
		timezone: dayStart.timezone
	});

	if (parsePetFoodWeightAndTimeResult.isErr()) {
		await ctx.reply(parsePetFoodWeightAndTimeResult.error);
		return;
	}

	const { quantity, time, timeChanged } = parsePetFoodWeightAndTimeResult.value;

	const addPetFoodResult =
		await petFoodService.addPetFoodAndScheduleNotification({
			petID: currentPet.id,
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
		id: currentPet.id,
		quantity,
		user: ctx.user,
		time: timeChanged ? time : undefined
	});
}) satisfies MiddlewareFn<Context>;
