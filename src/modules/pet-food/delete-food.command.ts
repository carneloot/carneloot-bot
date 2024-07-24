import type { ConversationFn } from '@grammyjs/conversations';

import { utcToZonedTime } from 'date-fns-tz';
import type { MiddlewareFn } from 'grammy';
import { fromUnixTime } from 'date-fns';

import invariant from 'tiny-invariant';
import Qty from 'js-quantities';

import type { Context } from '../../common/types/context.js';
import { getConfig } from '../../lib/entities/config.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import {
	deletePetFood,
	getPetFoodByRange
} from '../../lib/entities/pet-food.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';

export const deleteFoodConversation = (async (cvs, ctx) => {
	const user = ctx.user;

	if (!user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const currentPet = await cvs.external(() =>
		getConfig('user', 'currentPet', user.id)
	);

	if (!currentPet) {
		await ctx.reply(
			'Você ainda não configurou o pet atual.\nUtilize o comando /escolher_pet para configurar'
		);
		return;
	}

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

	const now = fromUnixTime(ctx.message.date);

	const { from, to } = getDailyFromTo(now, dayStart);

	const petFoods = await cvs.external(() =>
		getPetFoodByRange(currentPet.id, from, to)
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

	await cvs.external(() => deletePetFood(selectedFood.id));

	await ctx.reply('Ração deletada com sucesso!');
}) satisfies ConversationFn<Context>;

export const DeleteFoodCommand = (async (ctx) => {
	await ctx.conversation.enter('deleteFood');
}) satisfies MiddlewareFn<Context>;
