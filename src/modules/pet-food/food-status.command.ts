import { fromUnixTime } from 'date-fns';
import { Array as Arr, Option, Predicate, pipe } from 'effect';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';
import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';

import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getRelativeTime } from '../../common/utils/get-relative-time.js';
import { getConfig } from '../../lib/entities/config.js';
import { getDailyFoodConsumption } from '../../lib/entities/pet-food.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';

export const FoodStatusCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	invariant(ctx.message, 'Message object not found.');

	const now = fromUnixTime(ctx.message.date);

	const allPets = await Promise.all([
		getUserOwnedPets(ctx.user.id),
		getUserCaredPets(ctx.user.id)
	]).then(Arr.flatten);

	const petMessages = await Promise.all(
		allPets.map(async (pet) => {
			const dayStart = await getConfig('pet', 'dayStart', pet.id);

			if (!dayStart) {
				await ctx.reply(
					`Você ainda não configurou o horário de início do dia para o pet ${pet.name}.\nUtilize o comando /configurar_inicio_dia para configurar`
				);
				return;
			}

			const { from, to } = getDailyFromTo(now, dayStart);

			const dailyFoodConsumption = await getDailyFoodConsumption(
				pet.id,
				from,
				to
			);

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
					getRelativeTime(v, now, {
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
				Arr.filter(Predicate.isNotNull),
				Arr.join(' ')
			);
		})
	);

	await ctx.reply(petMessages.filter(Boolean).join('\n'), {
		parse_mode: 'MarkdownV2'
	});
}) satisfies MiddlewareFn<Context>;
