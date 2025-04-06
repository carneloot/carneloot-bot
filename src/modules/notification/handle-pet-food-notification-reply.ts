import { Reactions } from '@grammyjs/emoji';

import { DateTime, Effect, Either } from 'effect';

import invariant from 'tiny-invariant';

import type { PetID } from '../../lib/database/schema.js';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { getConfigEffect } from '../../lib/entities/config.js';
import { getPetByID } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { sendAddedFoodNotification } from '../pet-food/utils/send-added-food-notification.js';

export const handlePetFoodNotificationReply = (ctx: Context, petID: PetID) =>
	Effect.gen(function* () {
		invariant(ctx.message, 'Message object not found.');
		invariant(ctx.user, 'User is not defined.');

		const pet = yield* Effect.tryPromise(() => getPetByID(petID)).pipe(
			Effect.withSpan('getPetByID')
		);

		if (!pet) {
			yield* Effect.tryPromise(() =>
				ctx.reply(
					'Pet não encontrado. Isso nunca é para acontecer, mas se acontecer, contate o dono do bot.'
				)
			).pipe(Effect.withSpan('ctx.reply'));
			return;
		}

		const dayStart = yield* getConfigEffect('pet', 'dayStart', petID);

		const parsePetFoodWeightAndTimeResult = parsePetFoodWeightAndTime({
			messageMatch: ctx.message.text,
			messageTime: ctx.message.date,
			timezone: dayStart.timezone
		});

		if (Either.isLeft(parsePetFoodWeightAndTimeResult)) {
			yield* Effect.tryPromise(() =>
				ctx.reply(parsePetFoodWeightAndTimeResult.left)
			).pipe(Effect.withSpan('ctx.reply'));
			return;
		}

		const { quantity, time, timeChanged } =
			parsePetFoodWeightAndTimeResult.right;

		const addPetFoodResult =
			yield* petFoodService.addPetFoodAndScheduleNotification({
				pet,
				messageID: ctx.message.message_id,
				userID: ctx.user.id,

				time: DateTime.unsafeMake(time),
				quantity,
				timeChanged,

				dayStart
			});

		if (Either.isLeft(addPetFoodResult)) {
			yield* Effect.tryPromise(() => ctx.reply(addPetFoodResult.left)).pipe(
				Effect.withSpan('ctx.reply')
			);

			return;
		}

		const { message } = addPetFoodResult.right;

		yield* Effect.all(
			[
				Effect.tryPromise(() => ctx.reply(message)).pipe(
					Effect.withSpan('ctx.reply')
				),
				Effect.tryPromise(() => ctx.react(Reactions.thumbs_up)).pipe(
					Effect.withSpan('ctx.react')
				),
				sendAddedFoodNotification({
					id: petID,
					quantity,
					user: ctx.user,
					time: timeChanged ? time : undefined
				})(ctx)
			],
			{ concurrency: 'unbounded', mode: 'either' }
		);
	}).pipe(Effect.scoped, Effect.withSpan('handlePetFoodNotificationReply'));
