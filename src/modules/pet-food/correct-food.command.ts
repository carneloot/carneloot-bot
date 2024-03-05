import { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';
import { getUnixTime, isEqual } from 'date-fns';

import { Context } from '../../common/types/context.js';
import {
	getLastPetFood,
	getPetFoodByMessageId,
	schedulePetFoodNotification,
	updatePetFood
} from '../../lib/entities/pet-food.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';

export const correctFoodConversation = (async (cvs, ctx) => {
	await ctx.reply('Responda a mensagem que quer corrigir com o valor correto.');

	const replyResponse = await cvs.waitUntil(
		(ctx) => ctx.message?.reply_to_message !== undefined,
		(ctx) => ctx.reply('Por favor responda a uma mensagem.')
	);

	const petFoodMessage = replyResponse.message!.reply_to_message!;

	const petFood = await cvs.external(() => getPetFoodByMessageId(petFoodMessage.message_id));

	if (!petFood) {
		await ctx.reply(
			'Não encontrei uma entrada de ração vinda dessa mensagem. Use o comando novamente para tentar de novo'
		);

		return;
	}

	const result = parsePetFoodWeightAndTime(replyResponse.message!.text, getUnixTime(petFood.time));

	if (result.isErr()) {
		await ctx.reply(result.error);
		return;
	}

	const { quantity, time } = result.value;

	await cvs.external(() =>
		updatePetFood(petFood.id, {
			quantity: quantity.scalar,
			time
		})
	);

	const lastFood = await cvs.external(() => getLastPetFood(petFood.petID));

	const isLastFood = petFood.id === lastFood?.id;

	// If last food updated its time, reschedule notification
	if (isLastFood && !isEqual(time, petFood.time)) {
		await cvs.external(() => schedulePetFoodNotification(petFood.petID, petFood.id, time));
	}

	await ctx.reply('Ração alterada com sucesso!');
}) satisfies ConversationFn<Context>;

export const CorrectFoodCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('correctFood', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
