import { Reactions } from '@grammyjs/emoji';

import { Array as Arr, DateTime, Effect, Either, Exit, Scope } from 'effect';
import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getConfig } from '../../lib/entities/config.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';
import { sendAddedFoodNotification } from './utils/send-added-food-notification.js';

export const addFoodConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);
	if (!user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const allPets = await cvs.external(() =>
		Promise.all([getUserOwnedPets(user.id), getUserCaredPets(user.id)]).then(
			Arr.flatten
		)
	);

	const currentPet = await showOptionsKeyboard({
		values: allPets,
		labelFn: (pet) => pet.name,
		message: 'Selecione o pet para adicionar a comida:',
		rowNum: 2
	})(cvs, ctx);

	const dayStart = await cvs.external(() =>
		getConfig('pet', 'dayStart', currentPet.id)
	);

	if (!dayStart) {
		await ctx.reply(
			'Por favor, configure o horário de início do dia para o pet.'
		);
		return;
	}

	ctx.reply(
		`Certo, voce colocou ração para o pet ${currentPet.name}. Envie a quantidade. Caso não foi colocado agora, informe também o horário.`
	);

	const foodResponse = await cvs.waitUntil(
		async (ctx) => {
			if (!ctx.message) {
				return false;
			}

			const result = await parsePetFoodWeightAndTime({
				messageMatch: ctx.message.text,
				messageTime: ctx.message.date,
				timezone: dayStart.timezone
			}).pipe(Effect.either, runtime.runPromise);

			return Either.isRight(result);
		},
		{ otherwise: (ctx) => ctx.reply('Envie a quantidade de ração colocada') }
	);

	invariant(foodResponse.message, 'Message is not defined');
	invariant(ctx.message, 'Invalid message');

	const parsePetFoodWeightAndTimeResult = await parsePetFoodWeightAndTime({
		messageMatch: foodResponse.message.text,
		messageTime: foodResponse.message.date,
		timezone: dayStart.timezone
	}).pipe(Effect.either, runtime.runPromise);

	if (Either.isLeft(parsePetFoodWeightAndTimeResult)) {
		await ctx.reply(parsePetFoodWeightAndTimeResult.left.message);
		return;
	}

	const { quantity, time, timeChanged } = parsePetFoodWeightAndTimeResult.right;

	const addPetFoodResult = await cvs.external(() =>
		petFoodService
			.addPetFoodAndScheduleNotification({
				pet: currentPet,
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				messageID: foodResponse.message!.message_id,
				userID: user.id,

				time: DateTime.unsafeMake(time),
				quantity,
				timeChanged,

				dayStart
			})
			.pipe(Effect.scoped, Effect.either, runtime.runPromise)
	);

	if (Either.isLeft(addPetFoodResult)) {
		if (addPetFoodResult.left._tag === 'DuplicatedEntryError') {
			await ctx.reply(addPetFoodResult.left.message);
		}
		return;
	}

	const { message } = addPetFoodResult.right;

	await foodResponse.reply(message);
	await foodResponse.react(Reactions.thumbs_up);

	await cvs.external((ctx) =>
		sendAddedFoodNotification({
			id: currentPet.id,
			quantity,
			user,
			time: timeChanged ? time : undefined
		})(ctx).pipe(Effect.scoped, runtime.runPromise)
	);
}) satisfies ConversationFn;

export const AddFoodCommand = (async (ctx) => {
	await ctx.conversation.enter('addFood');
}) satisfies MiddlewareFn<Context>;
