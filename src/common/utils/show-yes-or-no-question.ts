import type { ConversationFn } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';

import type { Context } from '../types/context.js';

export const showYesOrNoQuestion = (message: string) =>
	(async (conversation, ctx) => {
		const answerInviteKeyboard = new InlineKeyboard()
			.text('Sim', 'yes')
			.text('Não', 'no');

		await ctx.reply(message, {
			reply_markup: answerInviteKeyboard
		});

		const answerInviteResponse = await conversation.waitForCallbackQuery(
			['yes', 'no'],
			(ctx) => ctx.reply('Por favor, escolha uma opção')
		);
		await answerInviteResponse.answerCallbackQuery();

		return answerInviteResponse.callbackQuery.data === 'yes';
	}) satisfies ConversationFn<Context>;
