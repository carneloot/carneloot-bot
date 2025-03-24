import type { ConversationFn } from '@grammyjs/conversations';

import invariant from 'tiny-invariant';

import { getUnixTime } from 'date-fns';
import { DateTime, Either } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfig } from '../../lib/entities/config.js';
import {
	getLastPetFood,
	getPetFoodByMessageId,
	updatePetFood
} from '../../lib/entities/pet-food.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';

export const correctFoodConversation = (async (cvs, ctx) => {
	await ctx.reply('Responda a mensagem que quer corrigir com o valor correto.');

	const replyResponse = await cvs.waitUntil(
		(ctx) => ctx.message?.reply_to_message !== undefined,
		(ctx) => ctx.reply('Por favor responda a uma mensagem.')
	);

	invariant(
		replyResponse.message?.reply_to_message,
		'Message object not found.'
	);

	const petFoodMessage = replyResponse.message.reply_to_message;

	const petFood = await cvs.external(() =>
		getPetFoodByMessageId(petFoodMessage.message_id)
	);

	if (!petFood) {
		await ctx.reply(
			'Não encontrei uma entrada de ração vinda dessa mensagem. Use o comando novamente para tentar de novo'
		);

		return;
	}

	const dayStart = await getConfig('pet', 'dayStart', petFood.petID);

	if (!dayStart) {
		await ctx.reply(
			'Por favor, configure o horário de início do dia para o pet.'
		);
		return;
	}

	const result = parsePetFoodWeightAndTime({
		messageMatch: replyResponse.message?.text,
		messageTime: getUnixTime(petFood.time),
		timezone: dayStart.timezone
	});

	if (Either.isLeft(result)) {
		await ctx.reply(result.left);
		return;
	}

	const { quantity, time, timeChanged } = result.right;

	await cvs.external(() =>
		updatePetFood(petFood.id, {
			quantity: quantity.scalar,
			time
		})
	);

	const lastFood = await cvs.external(() => getLastPetFood(petFood.petID));

	const isLastFood = petFood.id === lastFood?.id;

	// If last food updated its time, reschedule notification
	if (isLastFood && timeChanged) {
		await cvs.external(() =>
			petFoodService
				.schedulePetFoodNotification(
					petFood.petID,
					petFood.id,
					DateTime.unsafeMake(time)
				)
				.pipe(runtime.runPromise)
		);
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
