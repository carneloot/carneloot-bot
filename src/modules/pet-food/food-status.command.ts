import { formatDistanceStrict, fromUnixTime } from 'date-fns';
import { MiddlewareFn } from 'grammy';

import ptBR from 'date-fns/locale/pt-BR';
import Qty from 'js-quantities';

import { Context } from '../../common/types/context.js';

import { getDailyFoodConsumption } from '../../lib/entities/pet-food.js';
import { getConfig } from '../../lib/entities/config.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';

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

	const now = fromUnixTime(ctx.message!.date);

	const { from, to } = getDailyFromTo(now, dayStart);

	const dailyFoodConsumption = await getDailyFoodConsumption(currentPet.id, from, to);

	if (!dailyFoodConsumption || dailyFoodConsumption.total === 0) {
		await ctx.reply('Ainda não foi colocado ração hoje. Utilize o comando /colocar_racao');
		return;
	}

	const qtd = Qty(dailyFoodConsumption.total, 'g');
	const lastTime = fromUnixTime(dailyFoodConsumption.lastTime);
	const timeSinceLast = formatDistanceStrict(lastTime, now, {
		addSuffix: true,
		locale: ptBR
	});

	await ctx.reply(
		`Hoje já foram colocados ${qtd} de ração para o pet ${dailyFoodConsumption.name}.\nFoi colocado pela última vez ${timeSinceLast}.`
	);
}) satisfies MiddlewareFn<Context>;
