import { ConversationFn } from '@grammyjs/conversations';
import { getTimeZones } from '@vvo/tzdb';

import { MiddlewareFn } from 'grammy';

import { getConfig, setConfig } from '../../lib/entities/config.js';

import { Context } from '../../common/types/context.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getUserOwnedPets } from '../../lib/entities/pet.js';

const hoursOptions = Array.from({ length: 24 }, (_, i) => ({
	value: i,
	label: `${i}h`
}));

export const setDayStartConversation = (async (cvs, ctx) => {
	const pets = await cvs.external(() => getUserOwnedPets(ctx.user!.id));

	if (pets.length === 0) {
		await ctx.reply('Você ainda não cadastrou nenhum pet.');
		return;
	}

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet para configurar:'
	})(cvs, ctx);

	const dayStart = await cvs.external(() => getConfig('pet', 'dayStart', pet.id));

	const message = dayStart
		? `O horário de início atual do pet ${pet.name} é ${dayStart.hour}h no fuso horário "${dayStart.timezone}".`
		: `Você ainda não definiu um horário de início do dia para ${pet.name}.`;

	const answer = await showYesOrNoQuestion(
		`${message} Deseja ${dayStart ? 'alterar' : 'adicionar'}?`
	)(cvs, ctx);

	if (!answer) {
		await ctx.replyWithEmoji`Ok ${'smiling_face_with_smiling_eyes'}`;
		return;
	}

	const hour = await showOptionsKeyboard({
		values: hoursOptions,
		labelFn: (hour) => hour.label,
		message: 'Escolha o horário de início do dia:',
		keyboardType: 'custom',
		rowNum: 4
	})(cvs, ctx);

	const timezone = await showOptionsKeyboard({
		values: getTimeZones(),
		labelFn: (tz) => tz.name,
		message: 'Escolha o fuso horário de início do dia:',
		keyboardType: 'custom',
		rowNum: 4
	})(cvs, ctx);

	await cvs.external(() =>
		setConfig('pet', 'dayStart', pet.id, { hour: hour.value, timezone: timezone.name })
	);

	await ctx.reply(
		`O horário de início do dia do pet ${pet.name} foi definido para ${hour.value}h no fuso horário "${timezone.name}".`
	);
}) satisfies ConversationFn<Context>;

export const SetDayStartCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('setDayStart', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
