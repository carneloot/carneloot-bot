import { fromUnixTime } from 'date-fns';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';

import type { Context } from '../../common/types/context.js';

import invariant from 'tiny-invariant';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getRelativeTime } from '../../common/utils/get-relative-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { getDailyFoodConsumption } from '../../lib/entities/pet-food.js';

export const FoodStatusCommand = (async (ctx) => {
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
			'Você ainda não configurou o horário de início do dia.\nUtilize o comando /configurar_inicio_dia para configurar'
		);
		return;
	}

	invariant(ctx.message, 'Message object not found.');

	const now = fromUnixTime(ctx.message.date);

	const { from, to } = getDailyFromTo(now, dayStart);

	const dailyFoodConsumption = await getDailyFoodConsumption(
		currentPet.id,
		from,
		to
	);

	if (!dailyFoodConsumption || dailyFoodConsumption.total === 0) {
		await ctx.reply(
			'Ainda não foi colocado ração hoje. Utilize o comando /colocar_racao'
		);
		return;
	}

	const qtd = Qty(dailyFoodConsumption.total, 'g');
	const lastTime = fromUnixTime(dailyFoodConsumption.lastTime);
	let timeSinceLast = getRelativeTime(lastTime, now, {
		units: ['years', 'months', 'weeks', 'days', 'hours', 'minutes']
	});

	if (timeSinceLast.length === 0) {
		timeSinceLast = 'menos de um minuto';
	}

	await ctx.reply(
		`Hoje já foram colocados ${qtd} de ração para o pet ${dailyFoodConsumption.name}.\nFoi colocado pela última vez há ${timeSinceLast}.`
	);
}) satisfies MiddlewareFn<Context>;
