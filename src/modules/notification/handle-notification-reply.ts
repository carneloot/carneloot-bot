import { MiddlewareFn } from 'grammy';

import { Context } from '../../common/types/context';
import { getNotificationFromHistory } from '../../lib/notification';
import { handleBartoFoodReply } from './handle-barto-food-reply';
import { getUserDisplay } from '../../common/utils/get-user-display';

export const handleNotificationReply = (async (ctx, next) => {
	if (!ctx.message?.reply_to_message) {
		return next();
	}

	if (!ctx.user) {
		return;
	}

	const { reply_to_message: notificationMessage } = ctx.message;

	const notification = await getNotificationFromHistory(
		notificationMessage.message_id,
		ctx.user.id
	);

	if (!notification) {
		await ctx.reply(
			'Não foi possível encontrar a notificação original no histórico. Por favor, responda a notificação mais recente.'
		);
		return;
	}

	const { messageToReply, ownerTelegramId, keyword } = notification;

	if (keyword === 'BartoFood') {
		return await handleBartoFoodReply(ctx, notification);
	}

	if (ctx.user.telegramID === ownerTelegramId) {
		await ctx.reply('Você não pode responder a sua própria notificação.');
		return;
	}

	const userDisplayInformation = getUserDisplay(ctx.message.from);

	const message = `${userDisplayInformation}: ${ctx.message.text}`;
	await ctx.api.sendMessage(ownerTelegramId, message, { reply_to_message_id: messageToReply });
}) satisfies MiddlewareFn<Context>;
