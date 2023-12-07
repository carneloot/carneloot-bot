import { MiddlewareFn } from 'grammy';

import { Context } from '../../common/types/context';
import { getNotificationFromHistory } from '../../lib/notification';

export const handleNotificationReply = (async (ctx) => {
	if (!ctx.message?.reply_to_message) {
		return;
	}

	if (!ctx.user) {
		return;
	}

	const { reply_to_message: notificationMessage } = ctx.message;

	const result = await getNotificationFromHistory(notificationMessage.message_id, ctx.user.id);

	if (!result) {
		await ctx.reply(
			'Não foi possível encontrar a notificação original no histórico. Por favor, responda a notificação mais recente.'
		);
		return;
	}

	const { messageToReply, ownerTelegramId } = result;

	if (ctx.user.telegramID === ownerTelegramId) {
		await ctx.reply('Você não pode responder a sua própria notificação.');
		return;
	}

	const userDisplayInformation = ctx.message.from.username
		? `@${ctx.message.from.username}`
		: `${ctx.message.from.first_name} ${ctx.message.from.last_name}`;

	const message = `${userDisplayInformation}: ${ctx.message.text}`;
	await ctx.api.sendMessage(ownerTelegramId, message, { reply_to_message_id: messageToReply });
}) satisfies MiddlewareFn<Context>;
