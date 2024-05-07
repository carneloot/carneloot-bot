import type { MiddlewareFn } from 'grammy';

import type { Context } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { getNotificationFromHistory } from '../../lib/entities/notification.js';
import { handlePetFoodNotificationReply } from './handle-pet-food-notification-reply.js';

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

	if (notification.petID) {
		return await handlePetFoodNotificationReply(notification.petID)(ctx);
	}

	const { messageToReply, ownerTelegramId } = notification;

	if (!messageToReply || !ownerTelegramId) {
		return;
	}

	if (ctx.user.telegramID === ownerTelegramId) {
		await ctx.reply('Você não pode responder a sua própria notificação.');
		return;
	}

	const userDisplayInformation = getUserDisplay(ctx.message.from);

	const message = `${userDisplayInformation}: ${ctx.message.text}`;
	await ctx.api.sendMessage(ownerTelegramId, message, {
		reply_to_message_id: messageToReply
	});
}) satisfies MiddlewareFn<Context>;
