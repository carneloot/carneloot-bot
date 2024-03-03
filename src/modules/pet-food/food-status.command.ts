import { formatDistanceStrict } from 'date-fns/formatDistanceStrict';
import { MiddlewareFn } from 'grammy';
import { DateTime } from 'luxon';
import { ptBR } from 'date-fns/locale';

import Qty from 'js-quantities';

import { Context } from '../../common/types/context';

import { getDailyFoodConsumption } from '../../lib/pet-food';
import { getConfig } from '../../lib/config';

export const FoodStatusCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const dayStart = await getConfig('user', 'dayStart', ctx.user.id);

	if (!dayStart) {
		await ctx.reply(
			'Você ainda não configurou o horário de início do dia.\nUtilize o comando /configurar_inicio_dia para configurar'
		);
		return;
	}

	const currentPet = await getConfig('user', 'currentPet', ctx.user.id);

	if (!currentPet) {
		await ctx.reply(
			'Você ainda não configurou o pet atual.\nUtilize o comando /escolher_pet para configurar'
		);
		return;
	}

	const now = DateTime.fromSeconds(ctx.message!.date);

	let from = now
		.set({ hour: dayStart.hour, minute: 0, second: 0, millisecond: 0 })
		.setZone(dayStart.timezone);

	if (from > now) {
		from = from.minus({ days: 1 });
	}

	const to = from.plus({ days: 1 });

	const dailyFoodConsumption = await getDailyFoodConsumption(
		currentPet.id,
		from.toJSDate(),
		to.toJSDate()
	);

	if (!dailyFoodConsumption || dailyFoodConsumption.total === 0) {
		await ctx.reply('Ainda não foi colocado ração hoje. Utilize o comando /colocar_racao');
		return;
	}

	const qtd = Qty(dailyFoodConsumption.total, 'g');
	const lastTime = DateTime.fromSeconds(dailyFoodConsumption.lastTime);
	const timeSinceLast = formatDistanceStrict(lastTime.toJSDate(), now.toJSDate(), {
		addSuffix: true,
		locale: ptBR
	});

	await ctx.reply(
		`Hoje já foram colocados ${qtd} de ração para o pet ${dailyFoodConsumption.name}.\nFoi colocado pela última vez ${timeSinceLast}.`
	);
}) satisfies MiddlewareFn<Context>;
