import { Effect, Either, Match } from 'effect';
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
			.pipe(Effect.either);

		if (Either.isRight(notification)) {
			if (notification.right.petID) {
				return yield* handlePetFoodNotificationReply(
					ctx,
					notification.right.petID
				);
			}

			return yield* handleNotificationReply(ctx, notification.right);
		}

		// Check if the message is a reply to a food entry
		const petFoodRepository = yield* PetFoodRepository;
		const petFoods = yield* petFoodRepository.getPetFoodsFromMessage({
			messageId: repliedMessage.message_id
		});

		if (petFoods.length > 0) {
			return yield* handlePetFoodReply(ctx, petFoods);
		}
		return yield* Effect.promise(() => next());
	}).pipe(
		Effect.catchTag('MissingConfigError', (err) =>
			Effect.tryPromise(() =>
				ctx.reply(
					Match.value(err.key).pipe(
						Match.when(
							'dayStart',
							() =>
								'Por favor, configure o horário de início do dia para o pet.'
						),
						Match.when(
							'notificationDelay',
							() => 'Por favor, configure o tempo de notificação para o seu pet'
						),
						Match.exhaustive
					)
				)
			).pipe(Effect.withSpan('ctx.reply'), Effect.ignore)
		),
		Effect.catchTag('ParsePetFoodError', (err) =>
			Effect.tryPromise(() => ctx.reply(err.message)).pipe(
				Effect.withSpan('ctx.reply'),
				Effect.ignoreLogged
			)
		),
		Effect.catchTag('QueueError', (err) =>
			Effect.logError(err.message).pipe(Effect.ignoreLogged)
		),
		Effect.catchTag('DuplicatedEntryError', (err) =>
			Effect.tryPromise(() => ctx.reply(err.message)).pipe(
				Effect.withSpan('ctx.reply'),
				Effect.ignoreLogged
			)
		),
		Effect.withSpan('replyMiddleware'),
		runtime.runPromise
	)) satisfies MiddlewareFn<Context>;
