import { Reactions } from '@grammyjs/emoji';

// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import { Array, Data, DateTime, Effect, Option } from 'effect';

import { ConfigService } from '../../lib/entities/config.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';

import { sendAddedFoodNotification } from './utils/send-added-food-notification.js';

import { runtime } from '../../runtime.js';

class MissingUserError extends Data.TaggedError('MissingUserError') {}
class MissingRequiredFieldError extends Data.TaggedError(
	'MissingRequiredFieldError'
) {}

export const AddFoodAllCommand = (ctx: Context) =>
	Effect.gen(function* () {
		const user = yield* Option.fromNullable(ctx.user).pipe(
			Effect.catchTag('NoSuchElementException', () =>
				Effect.fail(new MissingUserError())
			)
		);

		const messageTime = yield* Option.fromNullable(ctx.message?.date).pipe(
			Effect.catchTag('NoSuchElementException', () =>
				Effect.fail(new MissingRequiredFieldError())
			)
		);
		const messageID = yield* Option.fromNullable(ctx.message?.message_id).pipe(
			Effect.catchTag('NoSuchElementException', () =>
				Effect.fail(new MissingRequiredFieldError())
			)
		);
		const messageMatch = ctx.message?.text;

		const allPets = yield* Effect.all(
			[
				Effect.tryPromise(() => getUserOwnedPets(user.id)).pipe(
					Effect.withSpan('getUserOwnedPets')
				),
				Effect.tryPromise(() => getUserCaredPets(user.id)).pipe(
					Effect.withSpan('getUserCaredPets')
				)
			],
			{ concurrency: 'unbounded' }
		).pipe(Effect.map(Array.flatten));

		const { quantity } = yield* parsePetFoodWeightAndTime({
			messageTime,
			messageMatch,
			timezone: 'UTC'
		});

		yield* Effect.all(
			allPets.map((pet) =>
				Effect.gen(function* () {
					const config = yield* ConfigService;

					const dayStart = yield* config.getConfig('pet', 'dayStart', pet.id);

					const { timeChanged, time } = yield* parsePetFoodWeightAndTime({
						messageTime,
						messageMatch,
						timezone: dayStart.timezone
					});

					yield* petFoodService.addPetFoodAndScheduleNotification({
						pet,

						messageID,
						userID: user.id,

						time: DateTime.unsafeMake(time),
						quantity,
						timeChanged,

						dayStart
					});

					yield* sendAddedFoodNotification({
						id: pet.id,
						quantity,
						user,
						time: timeChanged ? time : undefined
					})(ctx);
				}).pipe(Effect.withSpan('AddFoodAllCommand.sendSinglePet'))
			),
			{ concurrency: 'unbounded' }
		);

		yield* Effect.all(
			[
				Effect.tryPromise(() =>
					ctx.reply(
						`Foram adicionados ${quantity} de ração para todos os seus pets`
					)
				).pipe(Effect.withSpan('ctx.reply')),
				Effect.tryPromise(() => ctx.react(Reactions.thumbs_up)).pipe(
					Effect.withSpan('ctx.react')
				)
			],
			{ concurrency: 'unbounded', mode: 'either' }
		);
	}).pipe(
		Effect.catchTags({
			UnknownException: Effect.die,
			DatabaseError: Effect.die,
			MissingRequiredFieldError: Effect.die,
			MissingUserError: () =>
				Effect.tryPromise(() =>
					ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar')
				).pipe(Effect.withSpan('ctx.reply'), Effect.ignore),
			ParsePetFoodError: (err) =>
				Effect.tryPromise(() => ctx.reply(err.message)).pipe(
					Effect.withSpan('ctx.reply'),
					Effect.ignore
				),
			DuplicatedEntryError: (err) =>
				Effect.tryPromise(() => ctx.reply(err.message)).pipe(
					Effect.withSpan('ctx.reply'),
					Effect.ignore
				),
			MissingConfigError: (err) =>
				Effect.tryPromise(() =>
					ctx.reply(
						err.key === 'dayStart'
							? 'Por favor, configure o horário de início do dia para o pet.'
							: 'Por favor, configure o tempo de notificação para o seu pet'
					)
				).pipe(Effect.withSpan('ctx.reply'), Effect.ignore)
		}),
		Effect.scoped,
		Effect.withSpan('AddFoodAllCommand'),
		runtime.runPromise
	);
