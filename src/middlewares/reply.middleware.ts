import { Effect, Result } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context } from '../common/types/context.js';
import { NotificationRepository } from '../lib/repositories/notification.js';
import { PetFoodRepository } from '../lib/repositories/pet-food.js';
import { handleNotificationReply } from '../modules/notification/handle-notification-reply.js';
import { handlePetFoodNotificationReply } from '../modules/notification/handle-pet-food-notification-reply.js';
import { handlePetFoodReply } from '../modules/pet-food/handle-pet-food-reply.js';
import { runtime } from '../runtime.js';

export const replyMiddleware = ((ctx, next) =>
	Effect.gen(function* () {
		if (!ctx.message?.reply_to_message) {
			return yield* Effect.promise(() => next());
		}

		const user = ctx.user;
		if (!user) {
			return;
		}

		// Check if the message is a reply to a notification
		const notificationRepository = yield* NotificationRepository;

		const repliedMessage = ctx.message.reply_to_message;

		const notification = yield* notificationRepository
			.getNotificationFromHistory(repliedMessage.message_id, user.id)
			.pipe(Effect.result);

		if (Result.isSuccess(notification)) {
			if (notification.success.petID) {
				return yield* handlePetFoodNotificationReply(
					ctx,
					notification.success.petID,
				);
			}

			return yield* handleNotificationReply(ctx, notification.success);
		}

		// Check if the message is a reply to a food entry
		const petFoodRepository = yield* PetFoodRepository;
		const petFoods = yield* petFoodRepository.getPetFoodsFromMessage({
			messageId: repliedMessage.message_id,
		});

		if (petFoods.length > 0) {
			return yield* handlePetFoodReply(ctx, petFoods);
		}
		return yield* Effect.promise(() => next());
	}).pipe(
		Effect.catchTag('MissingConfigError', (err) =>
			Effect.tryPromise(() =>
				ctx.reply(
					err.key === 'dayStart'
						? 'Por favor, configure o horário de início do dia para o pet.'
						: 'Por favor, configure o tempo de notificação para o seu pet',
				),
			).pipe(Effect.withSpan('ctx.reply'), Effect.ignore),
		),
		Effect.catchTag('ParsePetFoodError', (err) =>
			Effect.tryPromise(() => ctx.reply(err.message)).pipe(
				Effect.withSpan('ctx.reply'),
				Effect.ignore({ log: 'Unhandled' }),
			),
		),
		Effect.catchTag('QueueError', (err) =>
			Effect.logError(err.message).pipe(Effect.ignore({ log: 'Unhandled' })),
		),
		Effect.catchTag('DuplicatedEntryError', (err) =>
			Effect.tryPromise(() => ctx.reply(err.message)).pipe(
				Effect.withSpan('ctx.reply'),
				Effect.ignore({ log: 'Unhandled' }),
			),
		),
		Effect.withSpan('replyMiddleware'),
		runtime.runPromise,
	)) satisfies MiddlewareFn<Context>;
