import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import {
	getPetCarers,
	getUserOwnedPets,
	removeCarer
} from '../../lib/entities/pet.js';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';

export const removeCarerConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const pets = await cvs.external(() => getUserOwnedPets(user.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para remover um cuidador:'
	})(cvs, ctx);

	const invites = await cvs.external(() => getPetCarers(pet.id));

	if (invites.length === 0) {
		await ctx.reply('Este pet não tem cuidadores');
		return;
	}

	const invite = await showOptionsKeyboard({
		values: invites,
		labelFn: (invite) => {
			const userDisplay = getUserDisplay(invite.carer);
			const status =
				invite.status === 'accepted'
					? 'aceito'
					: invite.status === 'rejected'
						? 'rejeitado'
						: 'pendente';

			return `${userDisplay} (${status})`;
		},
		message: 'Escolha um cuidador para remover:'
	})(cvs, ctx);

	await cvs.external(() => removeCarer(pet.id, invite.carer.id));

	await ctx.reply('Cuidador removido');

	await ctx.api.sendMessage(
		invite.carer.telegramID,
		`Você foi removido como cuidador do pet ${pet.name}`
	);
}) satisfies ConversationFn;

export const RemoveCarerCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('removeCarer', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
