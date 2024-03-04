import { addDays, formatDistanceStrict, fromUnixTime, isAfter, set, subDays } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import { MiddlewareFn } from 'grammy';
import { ptBR } from 'date-fns/locale';

import Qty from 'js-quantities';

import { Context } from '../../common/types/context';

import { getDailyFoodConsumption } from '../../lib/entities/pet-food';
import { getConfig } from '../../lib/entities/config';

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

	const now = fromUnixTime(ctx.message!.date);

	let from = set(now, {
		hours: dayStart.hour,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});

	if (isAfter(from, now)) {
		from = subDays(from, 1);
	}

	from = zonedTimeToUtc(from, dayStart.timezone);
	const to = zonedTimeToUtc(addDays(from, 1), dayStart.timezone);

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
