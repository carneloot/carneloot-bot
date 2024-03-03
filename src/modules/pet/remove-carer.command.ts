import type { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';

import { getPetCarers, getUserOwnedPets, removeCarer } from '../../lib/pet';

import { Context } from '../../common/types/context';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';
import { getUserDisplay } from '../../common/utils/get-user-display';

export const removeCarerConversation = (async (conversation, ctx) => {
	const pets = await conversation.external(() => getUserOwnedPets(ctx.user!.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para remover um cuidador:'
	})(conversation, ctx);

	const invites = await conversation.external(() => getPetCarers(pet.id));

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
	})(conversation, ctx);

	await conversation.external(() => removeCarer(pet.id, invite.carer.id));

	await ctx.reply('Cuidador removido');

	await ctx.api.sendMessage(
		invite.carer.telegramID,
		`Você foi removido como cuidador do pet ${pet.name}`
	);
}) satisfies ConversationFn<Context>;

export const RemoveCarerCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('removeCarer', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
