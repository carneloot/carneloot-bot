import { getUnixTime } from 'date-fns';
import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';
import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { ConfigService } from '../../lib/entities/config.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { runtime } from '../../runtime.js';

export const handlePetFoodReply = ((ctx, next) =>
	Effect.gen(function* () {
		if (!ctx.message?.reply_to_message) {
			yield* Effect.promise(() => next());
			return;
		}

		const user = ctx.user;
		if (!user) {
			return;
		}

		const petFoodRepository = yield* PetFoodRepository;
		const config = yield* ConfigService;

		const petFoods = yield* petFoodRepository.getPetFoodsFromMessage({
			messageId: ctx.message.reply_to_message.message_id
		});

		if (petFoods.length === 0) {
			yield* Effect.tryPromise(() =>
				ctx.reply(
					'Não foi possível encontrar nenhuma entrada relacionada a essa mensagem.'
				)
			).pipe(Effect.withSpan('ctx.reply'), Effect.ignoreLogged);
			return;
		}

		const messageMatch = ctx.message.text;

		const { quantity } = yield* parsePetFoodWeightAndTime({
			messageTime: ctx.message.date,
			messageMatch,
			timezone: 'UTC'
		});

		yield* Effect.forEach(
			petFoods,
			Effect.fn('handlePetFoodReply.handlePetFood')(function* (petFood) {
				const dayStart = yield* config.getConfig(
					'pet',
					'dayStart',
					petFood.petID
				);

				const messageTime = getUnixTime(petFood.time);

				const { time } = yield* parsePetFoodWeightAndTime({
					messageTime,
					messageMatch,
					timezone: dayStart.timezone
				});

				yield* petFoodRepository.updatePetFood({
					petFoodID: petFood.id,
					values: {
						quantity: quantity.scalar,
						time
					}
				});
			})
		);

		yield* Effect.tryPromise(() =>
			ctx.reply('Rações atualizadas com sucesso!')
		).pipe(Effect.withSpan('ctx.reply'), Effect.ignoreLogged);
	}).pipe(
		Effect.catchTag('MissingConfigError', () =>
			Effect.tryPromise(() =>
				ctx.reply('Por favor, configure o horário de início do dia para o pet.')
			).pipe(Effect.withSpan('ctx.reply'), Effect.ignore)
		),
		Effect.withSpan('handlePetFoodReply'),
		runtime.runPromise
	)) satisfies MiddlewareFn<Context>;
