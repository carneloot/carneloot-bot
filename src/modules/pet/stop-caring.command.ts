import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import { getUserCaredPets, removeCarer } from '../../lib/entities/pet.js';
import { getUserByID } from '../../lib/entities/user.js';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';

export const stopCaringConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const caringPets = await cvs.external(() => getUserCaredPets(user.id));

	if (!caringPets.length) {
		await ctx.reply('Você não está cuidando de nenhum pet');
		return;
	}

	const pet = await showOptionsKeyboard({
		values: caringPets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para parar de cuidar:'
	})(cvs, ctx);

	const answer = await showYesOrNoQuestion(
		'Tem certeza que deseja parar de cuidar deste pet?'
	)(cvs, ctx);

	if (answer) {
		await cvs.external(() => removeCarer(pet.id, user.id));
		await ctx.reply('Você parou de cuidar deste pet');

		const petOwner = await cvs.external(() => getUserByID(pet.ownerID));
		if (petOwner) {
			const carerDisplay = getUserDisplay(user);

			await ctx.api.sendMessage(
				petOwner.telegramID,
				`O cuidador ${carerDisplay} parou de cuidar do pet ${pet.name}`
			);
		}
	}
}) satisfies ConversationFn;

export const StopCaringCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('stopCaring');
}) satisfies MiddlewareFn<Context>;
