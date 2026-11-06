import { Reactions } from '@grammyjs/emoji';
import { Array, Data, DateTime, Effect, Option } from 'effect';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { ConfigService } from '../../lib/entities/config.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';
import { PetFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';
import { sendAddedFoodNotification } from './utils/send-added-food-notification.js';

class MissingUserError extends Data.TaggedError('MissingUserError') {}
class MissingRequiredFieldError extends Data.TaggedError(
	'MissingRequiredFieldError',
) {}

export const AddFoodAllCommand = (ctx: Context) =>
	Effect.gen(function* () {
		const user = yield* Effect.fromOption(Option.fromNullishOr(ctx.user)).pipe(
			Effect.catchTag('NoSuchElementError', () =>
				Effect.fail(new MissingUserError()),
			),
		);

		const messageTime = yield* Effect.fromOption(
			Option.fromNullishOr(ctx.message?.date),
		).pipe(
			Effect.catchTag('NoSuchElementError', () =>
				Effect.fail(new MissingRequiredFieldError()),
			),
		);
		const messageID = yield* Effect.fromOption(
			Option.fromNullishOr(ctx.message?.message_id),
		).pipe(
			Effect.catchTag('NoSuchElementError', () =>
				Effect.fail(new MissingRequiredFieldError()),
			),
		);
		const messageMatch = ctx.message?.text;

		const allPets = yield* Effect.all(
			[
				Effect.tryPromise(() => getUserOwnedPets(user.id)).pipe(
					Effect.withSpan('getUserOwnedPets'),
				),
				Effect.tryPromise(() => getUserCaredPets(user.id)).pipe(
					Effect.withSpan('getUserCaredPets'),
				),
			],
			{ concurrency: 'unbounded' },
		).pipe(Effect.map(Array.flatten));

		if (allPets.length === 0) {
			yield* Effect.tryPromise(() =>
				ctx.reply('Você não possui nenhum pet'),
			).pipe(Effect.withSpan('ctx.reply'));
			return;
		}

		const { quantity } = yield* parsePetFoodWeightAndTime({
			messageTime,
			messageMatch,
			timezone: 'UTC',
		});

		const config = yield* ConfigService;
		const petFoodService = yield* PetFoodService;

		yield* Effect.forEach(
			allPets,
			Effect.fn('AddFoodAllCommand.sendSinglePet')(function* (pet) {
				const dayStart = yield* config.getConfig('pet', 'dayStart', pet.id);

				const { timeChanged, time } = yield* parsePetFoodWeightAndTime({
					messageTime,
					messageMatch,
					timezone: dayStart.timezone,
				});

				yield* petFoodService.addPetFoodAndScheduleNotification({
					pet,

					messageID,
					userID: user.id,

					time: DateTime.makeUnsafe(time),
					quantity,
					timeChanged,

					dayStart,
				});

				yield* sendAddedFoodNotification({
					id: pet.id,
					quantity,
					user,
					time: timeChanged ? time : undefined,
				})(ctx);
			}),
			{ concurrency: 'unbounded' },
		);

		yield* Effect.all(
			[
				Effect.tryPromise(() =>
					ctx.reply(
						`Foram adicionados ${quantity} de ração para todos os seus pets`,
					),
				).pipe(Effect.withSpan('ctx.reply')),
				Effect.tryPromise(() => ctx.react(Reactions.thumbs_up)).pipe(
					Effect.withSpan('ctx.react'),
				),
			],
			{ concurrency: 'unbounded', mode: 'result' },
		);
	}).pipe(
		Effect.catchTags({
			MissingUserError: () =>
				Effect.tryPromise(() =>
					ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar'),
				).pipe(Effect.withSpan('ctx.reply'), Effect.ignore),
			ParsePetFoodError: (err) =>
				Effect.tryPromise(() => ctx.reply(err.message)).pipe(
					Effect.withSpan('ctx.reply'),
					Effect.ignore,
				),
			DuplicatedEntryError: (err) =>
				Effect.tryPromise(() => ctx.reply(err.message)).pipe(
					Effect.withSpan('ctx.reply'),
					Effect.ignore,
				),
			MissingConfigError: (err) =>
				Effect.tryPromise(() =>
					ctx.reply(
						err.key === 'dayStart'
							? 'Por favor, configure o horário de início do dia para o pet.'
							: 'Por favor, configure o tempo de notificação para o seu pet',
					),
				).pipe(Effect.withSpan('ctx.reply'), Effect.ignore),
		}),
		Effect.withSpan('AddFoodAllCommand'),
		runtime.runPromise,
	);
