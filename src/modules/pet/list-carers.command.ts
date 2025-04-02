import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import { getPetCarers, getUserOwnedPets } from '../../lib/entities/pet.js';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';

export const listCarersConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const pets = await cvs.external(() => getUserOwnedPets(user.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet:'
	})(cvs, ctx);

	const invites = await cvs.external(() => getPetCarers(pet.id));

	if (invites.length === 0) {
		await ctx.reply('Este pet não tem cuidadores');
		return;
	}

	const parsedInvites = invites.map((invite) => {
		const status =
			invite.status === 'accepted'
				? 'aceito'
				: invite.status === 'rejected'
					? 'rejeitado'
					: 'pendente';

		const carerDisplay = getUserDisplay(invite.carer);

		return `${carerDisplay} (${status})`;
	});

	await ctx.reply(`Cuidadores:\n${parsedInvites.join('\n')}`, {
		parse_mode: 'HTML'
	});
}) satisfies ConversationFn;

export const ListCarersCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('listCarers', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
