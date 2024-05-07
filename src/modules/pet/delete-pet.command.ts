import type { ConversationFn } from '@grammyjs/conversations';
import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import { deletePet, getUserOwnedPets } from '../../lib/entities/pet.js';

import type { Context } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';

export const deletePetConversation = (async (conversation, ctx) => {
	const user = ctx.user;

	invariant(user, 'User is not defined');

	const pets = await conversation.external(() => getUserOwnedPets(user.id));

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
