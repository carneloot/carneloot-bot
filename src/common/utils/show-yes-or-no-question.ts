import type { ConversationFn } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';

import type { Context } from '../types/context.js';
import { parseMessageForMarkdown } from './parse-message-for-makdown.js';

export const showYesOrNoQuestion = (message: string) =>
	(async (cvs, ctx) => {
		const answerInviteKeyboard = new InlineKeyboard()
			.text('Sim', 'yes')
			.text('Não', 'no');

		const optionsMessage = await ctx.reply(message, {
			reply_markup: answerInviteKeyboard
		});

		const answerInviteResponse = await cvs.waitForCallbackQuery(
			['yes', 'no'],
			(ctx) => ctx.reply('Por favor, escolha uma opção')
		);
		await answerInviteResponse.answerCallbackQuery();

		const result = answerInviteResponse.callbackQuery.data === 'yes';

		await ctx.api.editMessageText(
			optionsMessage.chat.id,
			optionsMessage.message_id,
			`${parseMessageForMarkdown(message)}\n>>${result ? 'Sim' : 'Não'}`,
			{
				parse_mode: 'MarkdownV2'
			}
		);

		return result;
	}) satisfies ConversationFn<Context>;
