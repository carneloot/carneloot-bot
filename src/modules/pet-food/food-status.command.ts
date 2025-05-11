import { fromUnixTime } from 'date-fns';

// biome-ignore lint/suspicious/noShadowRestrictedNames: Effect is cool
import { Array, DateTime, Effect, Option, pipe } from 'effect';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';
import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';

import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getRelativeTime } from '../../common/utils/get-relative-time.js';
import { ConfigService } from '../../lib/entities/config.js';
import {
	type Pet,
	getUserCaredPets,
	getUserOwnedPets
} from '../../lib/entities/pet.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { runtime } from '../../runtime.js';

const getPetMessage = (pet: Pick<Pet, 'id' | 'name'>, now: DateTime.DateTime) =>
	Effect.gen(function* () {
		const petFoodRepository = yield* PetFoodRepository;
		const config = yield* ConfigService;

		const dayStart = yield* config.getConfig('pet', 'dayStart', pet.id);

		yield* Effect.annotateCurrentSpan('pet', pet.id);

		const { from, to } = getDailyFromTo(now, dayStart);

		const dailyFoodConsumption =
			yield* petFoodRepository.getDailyFoodConsumption({
				petID: pet.id,
				from,
				to
			});

		const qty = pipe(
			dailyFoodConsumption,
			Option.map((v) => v.total),
			Option.getOrElse(() => 0),
			(quantity) => Qty(quantity, 'g')
		);

		const timeSinceLast = pipe(
			dailyFoodConsumption,
			Option.map((v) => fromUnixTime(v.lastTime)),
			Option.map((v) =>
				getRelativeTime(v, DateTime.toDate(now), {
					units: ['years', 'months', 'weeks', 'days', 'hours', 'minutes']
				})
			),
			Option.map((v) => (v.length === 0 ? 'menos de um minuto' : v))
		);

		return pipe(
			[
				Option.some(`\\- ${pet.name}: ${qty}`),
				Option.map(timeSinceLast, (v) => `última vez há ${v}`)
			],
			Array.getSomes,
			Array.join(' ')
		);
	}).pipe(Effect.withSpan('getPetMessage'));

export const FoodStatusCommand = ((ctx) =>
	Effect.gen(function* () {
		const user = ctx.user;

		if (!user) {
			yield* Effect.tryPromise(() =>
				ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar')
			);
			return;
		}

		invariant(ctx.message, 'Message object not found.');

		const now = yield* DateTime.make(ctx.message.date * 1000);

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

		const petMessages = yield* Effect.all(
			allPets.map((pet) =>
				getPetMessage(pet, now).pipe(
					Effect.scoped,
					Effect.asSome,
					Effect.catchTag('MissingConfigError', () =>
						Effect.tryPromise(() =>
							ctx.reply(
								`Você não configurou o inicio do dia para o pet ${pet.name}.`
							)
						).pipe(
							Effect.withSpan('ctx.reply'),
							Effect.ignoreLogged,
							Effect.andThen(Effect.succeedNone)
						)
					)
				)
			),
			{ concurrency: 'unbounded' }
		);

		yield* Effect.tryPromise(() =>
			ctx.reply(Array.getSomes(petMessages).join('\n'), {
				parse_mode: 'MarkdownV2'
			})
		).pipe(Effect.withSpan('ctx.reply'));
	}).pipe(
		Effect.withSpan('FoodStatusCommand'),
		runtime.runPromise
	)) satisfies MiddlewareFn<Context>;
