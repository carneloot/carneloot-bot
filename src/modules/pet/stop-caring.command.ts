import { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';

import { getUserByID } from '../../lib/entities/user';
import { getUserCaredPets, removeCarer } from '../../lib/entities/pet';

import { Context } from '../../common/types/context';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question';
import { getUserDisplay } from '../../common/utils/get-user-display';

export const stopCaringConversation = (async (conversation, ctx) => {
	const caringPets = await conversation.external(() => getUserCaredPets(ctx.user!.id));

	if (!caringPets.length) {
		await ctx.reply('Você não está cuidando de nenhum pet');
		return;
	}

	const pet = await showOptionsKeyboard({
		values: caringPets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para parar de cuidar:'
	})(conversation, ctx);

	const answer = await showYesOrNoQuestion('Tem certeza que deseja parar de cuidar deste pet?')(
		conversation,
		ctx
	);

	if (answer) {
		await conversation.external(() => removeCarer(pet.id, ctx.user!.id));
		await ctx.reply('Você parou de cuidar deste pet');

		const petOwner = await conversation.external(() => getUserByID(pet.ownerID));
		if (petOwner) {
			const carerDisplay = getUserDisplay(ctx.user!);

			await ctx.api.sendMessage(
				petOwner.telegramID,
				`O cuidador ${carerDisplay} parou de cuidar do pet ${pet.name}`
			);
		}
	}
}) satisfies ConversationFn<Context>;

export const StopCaringCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('stopCaring');
}) satisfies MiddlewareFn<Context>;
