import { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';

import { answerPendingPetInvite, getPendingPetInvites } from '../../lib/entities/pet.js';
import { getUserByID } from '../../lib/entities/user.js';

import { Context } from '../../common/types/context.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';

export const petInvitesConversation = (async (conversation, ctx) => {
	const pendingInvites = await conversation.external(() => getPendingPetInvites(ctx.user!.id));

	if (!pendingInvites.length) {
		await ctx.reply('Você não tem convites pendentes.');
		return;
	}

	const invite = await showOptionsKeyboard({
		values: pendingInvites,
		labelFn: (invite) => invite.petName,
		message:
			'Você tem convites pendentes para os seguintes pets. Escolha um para aceitar ou recusar:'
	})(conversation, ctx);

	const answer = await showYesOrNoQuestion(`Você aceita cuidar do pet ${invite.petName}?`)(
		conversation,
		ctx
	);

	await conversation.external(() =>
		answerPendingPetInvite(invite.id, answer ? 'accepted' : 'rejected')
	);

	await ctx.reply(`Você ${answer ? 'aceitou' : 'recusou'} o convite!`);

	const petOwner = await conversation.external(() => getUserByID(invite.petOwner));
	if (petOwner) {
		const carerDisplay = getUserDisplay(ctx.user!);

		await ctx.api.sendMessage(
			petOwner.telegramID,
			`O cuidador ${carerDisplay} ${
				answer ? 'aceitou' : 'recusou'
			} o convite para cuidar do pet ${invite.petName}`
		);
	}
}) satisfies ConversationFn<Context>;

export const PetInvitesCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('petInvites', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
