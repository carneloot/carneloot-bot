import { getUnixTime } from 'date-fns';
import { Effect } from 'effect';

import type { Context } from '../../common/types/context.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { ConfigService } from '../../lib/entities/config.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';

type PetFoods = Effect.Effect.Success<
	ReturnType<PetFoodRepository['getPetFoodsFromMessage']>
>;

export const handlePetFoodReply = Effect.fn('handlePetFoodReply')(function* (
	ctx: Context,
	petFoods: PetFoods
) {
	if (!ctx.message) {
		return;
	}

	const petFoodRepository = yield* PetFoodRepository;
	const config = yield* ConfigService;

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
});
