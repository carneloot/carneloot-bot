import { fromUnixTime } from 'date-fns';
import { Array as A, DateTime, Effect, Option, Predicate, pipe } from 'effect';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';
import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';

import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getRelativeTime } from '../../common/utils/get-relative-time.js';
import { getConfigEffect } from '../../lib/entities/config.js';
import {
	type Pet,
	getUserCaredPets,
	getUserOwnedPets
} from '../../lib/entities/pet.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { runtime } from '../../runtime.js';

const getPetMessage = (pet: Pick<Pet, 'id' | 'name'>, now: DateTime.DateTime) =>
	Effect.gen(function* () {
		const dayStart = yield* getConfigEffect('pet', 'dayStart', pet.id);
		const petFoodRepository = yield* PetFoodRepository;

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
				`\\- ${pet.name}: ${qty}`,
				Option.map(timeSinceLast, (v) => `há ${v}`).pipe(Option.getOrNull)
			],
			A.filter(Predicate.isNotNull),
			A.join(' ')
		);
	});

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

		const allPets = yield* Effect.all([
			Effect.tryPromise(() => getUserOwnedPets(user.id)),
			Effect.tryPromise(() => getUserCaredPets(user.id))
		]).pipe(Effect.map(A.flatten));

		const petMessages = yield* Effect.all(
			allPets.map((pet) =>
				getPetMessage(pet, now).pipe(
					Effect.map(Option.some),
					Effect.catchTag('MissingConfigError', () =>
						Effect.zipRight(
							Effect.tryPromise(() =>
								ctx.reply(
									`Você não configurou o inicio do dia para o pet ${pet.name}.`
								)
							).pipe(Effect.ignoreLogged),
							Effect.succeedNone
						)
					)
				)
			),
			{ concurrency: 'unbounded' }
		);

		yield* Effect.tryPromise(() =>
			ctx.reply(A.getSomes(petMessages).join('\n'), {
				parse_mode: 'MarkdownV2'
			})
		);
	}).pipe(runtime.runPromise)) satisfies MiddlewareFn<Context>;
