import { MiddlewareFn } from 'grammy';

import { Context } from '../../common/types/context';
import { getConfig } from '../../lib/config';
import Qty from 'js-quantities';
import { DateTime, Duration } from 'luxon';
import ms from 'ms';
import { addPetFood } from '../../lib/pet-food';
import { Reactions } from '@grammyjs/emoji';
import { WEIGHT_REGEX } from '../../common/constants';

export const AddFoodCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	if (!ctx.match || Array.isArray(ctx.match)) {
		await ctx.reply(
			'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
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

	const [quantityRaw, deltaTimeRaw] = ctx.match.split(' ');

	const quantityMatch = quantityRaw.match(WEIGHT_REGEX);
	if (!quantityMatch) {
		await ctx.reply('A quantidade de ração informada é inválida.');
		return;
	}

	const quantityQty = Qty(Number(quantityMatch[1]), quantityMatch[2] ?? 'g');
	const quantity = quantityQty.to('g').scalar;

	let time = DateTime.fromSeconds(ctx.message!.date);
	if (deltaTimeRaw) {
		const isNegative = deltaTimeRaw.startsWith('-');
		const deltaTime = ms(deltaTimeRaw.replace(/^-/, ''));
		const duration = Duration.fromMillis(deltaTime);
		if (isNegative) {
			time = time.minus(duration);
		} else {
			time = time.plus(duration);
		}
	}

	await addPetFood({
		userID: ctx.user.id,
		time: time.toJSDate(),
		petID: currentPet.id,
		quantity
	});

	await ctx.reply(`Foram adicionados ${quantityQty} de ração para o pet ${currentPet.name}.`);
	await ctx.react(Reactions.thumbs_up);
}) satisfies MiddlewareFn<Context>;
