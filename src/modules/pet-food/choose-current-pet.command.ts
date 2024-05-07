import type { ConversationFn } from '@grammyjs/conversations';

import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { setConfig } from '../../lib/entities/config.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';

export const chooseCurrentPetConversation = (async (cvs, ctx) => {
	const user = ctx.user;

	invariant(user, 'User is not defined');

	const ownedPets = await cvs.external(() => getUserOwnedPets(user.id));
	const caredPets = await cvs.external(() => getUserCaredPets(user.id));

	const chosenPet = await showOptionsKeyboard({
		values: [...ownedPets, ...caredPets].toSorted((a, b) =>
			a.name.localeCompare(b.name)
		),
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet que deseja rastrear a ração'
	})(cvs, ctx);

	await setConfig('user', 'currentPet', user.id, {
		id: chosenPet.id,
		name: chosenPet.name
	});

	await ctx.reply(
		`Os comandos relacionados a ração irão se referir ao pet ${chosenPet.name}`
	);
}) satisfies ConversationFn<Context>;

export const ChooseCurrentPetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('chooseCurrentPet', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
