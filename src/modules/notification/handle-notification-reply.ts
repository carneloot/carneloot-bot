import { Effect } from 'effect';

import type { Context } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import type { NotificationRepository } from '../../lib/repositories/notification.js';

type Notification = Effect.Success<
	ReturnType<NotificationRepository['getNotificationFromHistory']>
>;

export const handleNotificationReply = Effect.fn('handleNotificationReply')(
	function* (ctx: Context, notification: Notification) {
		const user = ctx.user;
		if (!user || !ctx.message) {
			return;
		}

		const { messageToReply, ownerTelegramId } = notification;

		if (!messageToReply || !ownerTelegramId) {
			return;
		}

		if (user.telegramID === ownerTelegramId) {
			yield* Effect.tryPromise(() =>
				ctx.reply('Você não pode responder a sua própria notificação.'),
			).pipe(Effect.withSpan('ctx.reply'), Effect.ignore({ log: 'Unhandled' }));
			return;
		}

		const userDisplayInformation = getUserDisplay(ctx.message.from);

		const message = `${userDisplayInformation}: ${ctx.message.text}`;
		yield* Effect.tryPromise(() =>
			ctx.api.sendMessage(ownerTelegramId, message, {
				reply_to_message_id: messageToReply,
			}),
		).pipe(
			Effect.withSpan('bot.api.sendMessage'),
			Effect.ignore({ log: 'Unhandled' }),
		);
	},
);
