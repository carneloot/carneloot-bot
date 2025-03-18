import { fromUnixTime, startOfDay } from 'date-fns';
import type { MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';

import type { Context } from '../../common/types/context.js';

import invariant from 'tiny-invariant';
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

	const ownedPets = await getUserOwnedPets(ctx.user.id);
	const caredPets = await getUserCaredPets(ctx.user.id);

	const allPets = ownedPets.concat(caredPets);

	const petMessages = await Promise.all(
		allPets.map(async (pet) => {
			const dayStart = await getConfig('pet', 'dayStart', pet.id);

			if (!dayStart) {
				await ctx.reply(
					'Você ainda não configurou o horário de início do dia.\nUtilize o comando /configurar_inicio_dia para configurar'
				);
				return;
			}

			const { from, to } = getDailyFromTo(now, dayStart);

			const dailyFoodConsumption = await getDailyFoodConsumption(
				pet.id,
				from,
				to
			);

			const qtd = Qty(dailyFoodConsumption?.total ?? 0, 'g');
			const lastTime = dailyFoodConsumption
				? fromUnixTime(dailyFoodConsumption.lastTime)
				: startOfDay(now);
			let timeSinceLast = getRelativeTime(lastTime, now, {
				units: ['years', 'months', 'weeks', 'days', 'hours', 'minutes']
			});

			if (timeSinceLast.length === 0) {
				timeSinceLast = 'menos de um minuto';
			}

			return `- Pet ${pet.name}: ${qtd} há ${timeSinceLast}`;
		})
	);

	await ctx.reply(petMessages.join('\n'), { parse_mode: 'MarkdownV2' });
}) satisfies MiddlewareFn<Context>;
