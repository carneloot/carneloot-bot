import { Reactions } from '@grammyjs/emoji';

import { addMilliseconds, fromUnixTime, subMilliseconds } from 'date-fns';
import { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';
import ms from 'ms';

import { Context } from '../../common/types/context';
import { getConfig } from '../../lib/config';
import { addPetFood } from '../../lib/pet-food';
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

	let time = fromUnixTime(ctx.message!.date);
	if (deltaTimeRaw) {
		const isNegative = deltaTimeRaw.startsWith('-');
		const deltaTime = ms(deltaTimeRaw.replace(/^-/, ''));
		if (isNegative) {
			time = subMilliseconds(time, deltaTime);
		} else {
			time = addMilliseconds(time, deltaTime);
		}
	}

	await addPetFood({
		userID: ctx.user.id,
		time: time,
		petID: currentPet.id,
		quantity
	});

	await ctx.reply(`Foram adicionados ${quantityQty} de ração para o pet ${currentPet.name}.`);
	await ctx.react(Reactions.thumbs_up);
}) satisfies MiddlewareFn<Context>;
