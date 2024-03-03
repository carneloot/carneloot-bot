import { ConversationFn } from '@grammyjs/conversations';
import { getTimeZones } from '@vvo/tzdb';

import { MiddlewareFn } from 'grammy';

import { getConfig, setConfig } from '../../lib/config';

import { Context } from '../../common/types/context';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';

const hoursOptions = Array.from({ length: 24 }, (_, i) => ({
	value: i,
	label: `${i}h`
}));

export const setDayStartConversation = (async (cvs, ctx) => {
	const dayStart = await cvs.external(() => getConfig('user', 'dayStart', ctx.user!.id));

	const message = dayStart
		? `Seu horário de início do dia atual é ${dayStart.hour}h no fuso horário ${dayStart.timezone}.`
		: 'Você ainda não definiu um horário de início do dia.';

	const answer = await showYesOrNoQuestion(`${message} Deseja alterar?`)(cvs, ctx);

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
		setConfig('user', 'dayStart', ctx.user!.id, { hour: hour.value, timezone: timezone.name })
	);

	await ctx.reply(
		`Seu horário de início do dia foi definido para ${hour.value}h no fuso horário ${timezone.name}.`
	);
}) satisfies ConversationFn<Context>;

export const SetDayStartCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('setDayStart', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
