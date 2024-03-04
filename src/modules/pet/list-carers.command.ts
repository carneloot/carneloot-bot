import type { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';

import { getPetCarers, getUserOwnedPets } from '../../lib/entities/pet';

import { Context } from '../../common/types/context';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';
import { getUserDisplay } from '../../common/utils/get-user-display';

export const listCarersConversation = (async (conversation, ctx) => {
	const pets = await conversation.external(() => getUserOwnedPets(ctx.user!.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet:'
	})(conversation, ctx);

	const invites = await conversation.external(() => getPetCarers(pet.id));

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

	await ctx.reply(`Cuidadores:\n${parsedInvites.join('\n')}`, { parse_mode: 'HTML' });
}) satisfies ConversationFn<Context>;

export const ListCarersCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('listCarers', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
