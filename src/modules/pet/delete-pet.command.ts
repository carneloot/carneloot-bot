import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';
import type { Context, ConversationFn } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import { deletePet, getUserOwnedPets } from '../../lib/entities/pet.js';

export const deletePetConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const pets = await cvs.external(() => getUserOwnedPets(user.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para deletar:'
	})(cvs, ctx);

	const answer = await showYesOrNoQuestion(
		`Você tem certeza que deseja deletar o pet ${pet.name}?`
	)(cvs, ctx);

	if (answer) {
		await cvs.external(() => deletePet(pet.id));
		await ctx.reply('Pet deletado!');
	}
}) satisfies ConversationFn;

export const DeletePetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('deletePet');
}) satisfies MiddlewareFn<Context>;
