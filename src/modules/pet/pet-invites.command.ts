import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import {
	answerPendingPetInvite,
	getPendingPetInvites
} from '../../lib/entities/pet.js';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';

export const petInvitesConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const pendingInvites = await cvs.external(() =>
		getPendingPetInvites(user.id)
	);

	if (!pendingInvites.length) {
		await ctx.reply('Você não tem convites pendentes.');
		return;
	}

	const invite = await showOptionsKeyboard({
		values: pendingInvites,
		rowNum: 1,
		labelFn: (invite) =>
			`${invite.petName} (${getUserDisplay(invite.petOwner)})`,
		message:
			'Você tem convites pendentes para os seguintes pets. Escolha um para aceitar ou recusar:'
	})(cvs, ctx);

	const answer = await showYesOrNoQuestion(
		`Você aceita cuidar do pet ${invite.petName}?`
	)(cvs, ctx);

	await cvs.external(() =>
		answerPendingPetInvite(invite.id, answer ? 'accepted' : 'rejected')
	);

	await ctx.reply(`Você ${answer ? 'aceitou' : 'recusou'} o convite!`);

	const carerDisplay = getUserDisplay(user);

	await ctx.api.sendMessage(
		invite.petOwner.telegramID,
		`O cuidador ${carerDisplay} ${
			answer ? 'aceitou' : 'recusou'
		} o convite para cuidar do pet ${invite.petName}`
	);
}) satisfies ConversationFn;

export const PetInvitesCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('petInvites', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
