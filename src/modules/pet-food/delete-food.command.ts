import { utcToZonedTime } from 'date-fns-tz';
import { Array as Arr, DateTime } from 'effect';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';
import invariant from 'tiny-invariant';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';

import { getConfig } from '../../lib/entities/config.js';
import {
	deletePetFood,
	getPetFoodByRange
} from '../../lib/entities/pet-food.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';

import { runtime } from '../../runtime.js';

export const deleteFoodConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	if (!user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const allPets = await cvs.external(() =>
		Promise.all([
			getUserOwnedPets(user.id),
			getUserCaredPets(user.id).then(
				Arr.map((v) => ({ id: v.id, name: `${v.name} (cuidando)` }))
			)
		]).then(Arr.flatten)
	);

	const currentPet = await showOptionsKeyboard({
		values: allPets,
		labelFn: (pet) => pet.name,
		message: 'Selecione o pet para apagar a comida:',
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

	invariant(ctx.message, 'Message object not found.');

	const now = DateTime.unsafeMake(ctx.message.date * 1000);

	const { from, to } = getDailyFromTo(now, dayStart);

	const petFoods = await cvs.external(() =>
		getPetFoodByRange(currentPet.id, DateTime.toDate(from), DateTime.toDate(to))
	);

	const selectedFood = await showOptionsKeyboard({
		values: petFoods,
		labelFn: (v) =>
			`${Qty(v.quantity, 'g')} | ${utcToZonedTime(
				v.time,
				dayStart.timezone
			).toLocaleString('pt-BR')} | ${getUserDisplay(v.user)}`,
		message: 'Escolha a ração para deletar:',
		rowNum: 1,
		addCancel: true
	})(cvs, ctx);

	if (!selectedFood) {
		await ctx.reply('Operação cancelada');
		return;
	}

	await cvs.external(async () => {
		await deletePetFood(selectedFood.id);

		await petFoodService
			.cancelPetFoodNotification(selectedFood.id)
			.pipe(runtime.runPromise);
	});

	await ctx.reply('Ração deletada com sucesso!');
}) satisfies ConversationFn;

export const DeleteFoodCommand = (async (ctx) => {
	await ctx.conversation.enter('deleteFood');
}) satisfies MiddlewareFn<Context>;
