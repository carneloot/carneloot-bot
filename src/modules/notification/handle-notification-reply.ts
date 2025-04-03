import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context } from '../../common/types/context.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { getNotificationFromHistory } from '../../lib/entities/notification.js';
import { runtime } from '../../runtime.js';
import { handlePetFoodNotificationReply } from './handle-pet-food-notification-reply.js';

export const handleNotificationReply = ((ctx, next) =>
	Effect.gen(function* () {
		if (!ctx.message?.reply_to_message) {
			yield* Effect.promise(() => next());
			return;
		}

		const user = ctx.user;
		if (!user) {
			return;
		}

		const { reply_to_message: notificationMessage } = ctx.message;

		const notification = yield* Effect.tryPromise(() =>
			getNotificationFromHistory(notificationMessage.message_id, user.id)
		).pipe(Effect.withSpan('getNotificationFromHistory'));

		if (!notification) {
			yield* Effect.tryPromise(() =>
				ctx.reply(
					'Não foi possível encontrar a notificação original no histórico. Por favor, responda a notificação mais recente.'
				)
			).pipe(Effect.withSpan('ctx.reply'));
			return;
		}

		if (notification.petID) {
			return yield* handlePetFoodNotificationReply(ctx, notification.petID);
		}

		const { messageToReply, ownerTelegramId } = notification;

		if (!messageToReply || !ownerTelegramId) {
			return;
		}

		if (user.telegramID === ownerTelegramId) {
			yield* Effect.tryPromise(() =>
				ctx.reply('Você não pode responder a sua própria notificação.')
			).pipe(Effect.withSpan('ctx.reply'));
			return;
		}

		const userDisplayInformation = getUserDisplay(ctx.message.from);

		const message = `${userDisplayInformation}: ${ctx.message.text}`;
		yield* Effect.tryPromise(() =>
			ctx.api.sendMessage(ownerTelegramId, message, {
				reply_to_message_id: messageToReply
			})
		).pipe(Effect.withSpan('bot.api.sendMessage'));
	}).pipe(
		Effect.withSpan('handleNotificationReply'),
		Effect.catchIf(
			(err) => err._tag === 'MissingConfigError' && err.key === 'dayStart',
			() =>
				Effect.tryPromise(() =>
					ctx.reply('Por favor, configure o inicio do dia para o seu pet')
				).pipe(Effect.ignore)
		),
		Effect.catchIf(
			(err) =>
				err._tag === 'MissingConfigError' && err.key === 'notificationDelay',
			() =>
				Effect.tryPromise(() =>
					ctx.reply(
						'Por favor, configure o tempo de notificação para o seu pet'
					)
				).pipe(Effect.ignore)
		),
		runtime.runPromise
	)) satisfies MiddlewareFn<Context>;
