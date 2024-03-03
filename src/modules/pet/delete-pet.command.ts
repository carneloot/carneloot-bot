import type { ConversationFn } from '@grammyjs/conversations';
import { MiddlewareFn } from 'grammy';

import { deletePet, getUserOwnedPets } from '../../lib/pet';

import { Context } from '../../common/types/context';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';

export const deletePetConversation = (async (conversation, ctx) => {
	const pets = await conversation.external(() => getUserOwnedPets(ctx.user!.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para deletar:'
	})(conversation, ctx);

	const answer = await showYesOrNoQuestion(
		`Você tem certeza que deseja deletar o pet ${pet.name}?`
	)(conversation, ctx);

	if (answer) {
		await conversation.external(() => deletePet(pet.id));
		await ctx.reply('Pet deletado!');
	}
}) satisfies ConversationFn<Context>;

export const DeletePetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('deletePet');
}) satisfies MiddlewareFn<Context>;
