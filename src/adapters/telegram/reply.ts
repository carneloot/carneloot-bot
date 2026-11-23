import { Effect, Result } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { AppServices } from '../../app/layer.js';
import type { Context } from '../../common/types/context.js';
import { ParsePetFoodError } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { MissingConfigError } from '../../lib/entities/config.js';
import { NotificationRepository } from '../../lib/repositories/notification.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { DuplicatedEntryError } from '../../lib/services/pet-food.js';
import { handlePetFoodReply } from '../../modules/pet-food/handle-pet-food-reply.js';
import type { Execute } from '../execute.js';
import { QueueError } from '../queue/pet-food-notification.js';
import { handleNotificationReply } from './notification/handle-notification-reply.js';
import { handlePetFoodNotificationReply } from './notification/handle-pet-food-notification-reply.js';

export const createReplyMiddleware = (execute: Execute<AppServices>) =>
	((ctx, next) =>
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
			Effect.catch((error) => {
				if (error instanceof MissingConfigError) {
					return Effect.tryPromise(() =>
						ctx.reply(
							error.key === 'dayStart'
								? 'Por favor, configure o horário de início do dia para o pet.'
								: 'Por favor, configure o tempo de notificação para o seu pet',
						),
					).pipe(Effect.ignore);
				}
				if (
					error instanceof ParsePetFoodError ||
					error instanceof DuplicatedEntryError
				) {
					return Effect.tryPromise(() => ctx.reply(error.message)).pipe(
						Effect.ignore,
					);
				}
				if (error instanceof QueueError) return Effect.logError(error.message);
				return Effect.fail(error);
			}),
			Effect.withSpan('replyMiddleware'),
			execute,
		)) satisfies MiddlewareFn<Context>;
