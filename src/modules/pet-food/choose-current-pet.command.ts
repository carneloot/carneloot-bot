import { ConversationFn } from '@grammyjs/conversations';
import { MiddlewareFn } from 'grammy';

import { Context } from '../../common/types/context';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/pet';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';
import { setConfig } from '../../lib/config';

export const chooseCurrentPetConversation = (async (cvs, ctx) => {
	const ownedPets = await cvs.external(() => getUserOwnedPets(ctx.user!.id));
	const caredPets = await cvs.external(() => getUserCaredPets(ctx.user!.id));

	const chosenPet = await showOptionsKeyboard({
		values: [...ownedPets, ...caredPets].toSorted((a, b) => a.name.localeCompare(b.name)),
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet que deseja rastrear a ração'
	})(cvs, ctx);

	await setConfig('user', 'currentPet', ctx.user!.id, {
		id: chosenPet.id,
		name: chosenPet.name
	});

	await ctx.reply(`Os comandos relacionados a ração irão se referir ao pet ${chosenPet.name}`);
}) satisfies ConversationFn<Context>;

export const ChooseCurrentPetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('chooseCurrentPet', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
