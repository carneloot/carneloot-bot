import { Reactions } from '@grammyjs/emoji';
import { MiddlewareFn } from 'grammy';
import { isAfter } from 'date-fns';

import { Context } from '../../common/types/context.js';
import { getConfig } from '../../lib/entities/config.js';
import {
	addPetFood,
	cancelPetFoodNotification,
	getLastPetFood,
	schedulePetFoodNotification
} from '../../lib/entities/pet-food.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';

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
		await ctx.reply('Por favor, configure o horário de início do dia para o pet.');
		return;
	}

	const result = parsePetFoodWeightAndTime({
		messageMatch: ctx.match,
		messageTime: ctx.message!.date,
		timezone: dayStart.timezone
	});

	if (result.isErr()) {
		await ctx.reply(result.error);
		return;
	}

	const { quantity, time } = result.value;

	const lastPetFood = await getLastPetFood(currentPet.id);

	const petFood = await addPetFood({
		userID: ctx.user.id,
		time: time,
		petID: currentPet.id,
		quantity: quantity.scalar,
		messageID: ctx.message?.message_id
	});

	if (!lastPetFood || isAfter(time, lastPetFood.time)) {
		if (lastPetFood) {
			await cancelPetFoodNotification(lastPetFood.id);
		}

		await schedulePetFoodNotification(currentPet.id, petFood.id, time);
	}

	await ctx.reply(`Foram adicionados ${quantity} de ração para o pet ${currentPet.name}.`);
	await ctx.react(Reactions.thumbs_up);
}) satisfies MiddlewareFn<Context>;
