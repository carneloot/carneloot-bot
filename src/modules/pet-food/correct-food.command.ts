import { getUnixTime, parseISO } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { Array as Arr, DateTime, Effect, Option } from 'effect';
import type { MiddlewareFn } from 'grammy';
import Qty from 'js-quantities';
import invariant from 'tiny-invariant';
import type { Context, ConversationFn } from '../../common/types/context.js';
import { getDailyFromTo } from '../../common/utils/get-daily-from-to.js';
import { getUserDisplay } from '../../common/utils/get-user-display.js';
import { parsePetFoodWeightAndTime } from '../../common/utils/parse-pet-food-weight-and-time.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getConfig } from '../../lib/entities/config.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';
import {
	getPetFoodByRange,
	updatePetFood
} from '../../lib/entities/pet-food.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { PetFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';

export const correctFoodConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	if (!user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const allPets = await cvs.external(() =>
		Promise.all([
			getUserOwnedPets(user.id),
			getUserCaredPets(user.id).then(
				Arr.map((v) => ({ id: v.id, name: `${v.name} (cuidando)` }))
			)
		]).then(Arr.flatten)
	);

	const currentPet = await showOptionsKeyboard({
		values: allPets,
		labelFn: (pet) => pet.name,
		message: 'Selecione o pet para apagar a comida:',
		rowNum: 2
	})(cvs, ctx);

	const dayStart = await cvs.external(() =>
		getConfig('pet', 'dayStart', currentPet.id)
	);

	if (!dayStart) {
		await ctx.reply(
			'Por favor, configure o horário de início do dia para o pet.'
		);
		return;
	}

	invariant(ctx.message, 'Message object not found.');

	const now = DateTime.unsafeMake(ctx.message.date * 1000);

	const { from, to } = getDailyFromTo(now, dayStart);

	const petFoods = await cvs.external(() =>
		getPetFoodByRange(currentPet.id, DateTime.toDate(from), DateTime.toDate(to))
	);

	if (petFoods.length === 0) {
		await ctx.reply('Ainda não foi colocado ração hoje');
		return;
	}

	const petFood = await showOptionsKeyboard({
		values: petFoods,
		labelFn: (v) =>
			`${Qty(v.quantity, 'g')} | ${utcToZonedTime(
				v.time,
				dayStart.timezone
			).toLocaleString('pt-BR')} | ${getUserDisplay(v.user)}`,
		message: 'Escolha a ração para deletar:',
		rowNum: 1,
		addCancel: true
	})(cvs, ctx);

	if (!petFood) {
		await ctx.reply('Operação cancelada');
		return;
	}

	await ctx.reply('Qual será a nova quantidade de ração (e/ou horário)?');

	const messageTime = getUnixTime(
		typeof petFood.time === 'string' ? parseISO(petFood.time) : petFood.time
	);

	const replyResponse = await cvs.waitUntil(
		(ctx) =>
			parsePetFoodWeightAndTime({
				messageMatch: ctx.message?.text,
				messageTime,
				timezone: dayStart.timezone
			}).pipe(Effect.isSuccess, Effect.runPromise),
		{ otherwise: (ctx) => ctx.reply('Envie a quantidade de ração colocada.') }
	);

	const result = await parsePetFoodWeightAndTime({
		messageMatch: replyResponse.message?.text,
		messageTime,
		timezone: dayStart.timezone
	}).pipe(Effect.orDie, runtime.runPromise);

	const { quantity, time, timeChanged } = result;

	await cvs.external(() =>
		updatePetFood(petFood.id, {
			quantity: quantity.scalar,
			time
		})
	);

	const lastFood = await cvs.external(() =>
		PetFoodRepository.pipe(
			Effect.flatMap((repo) => repo.getLastPetFood({ petID: currentPet.id })),
			runtime.runPromise
		)
	);

	const isLastFood = Option.match(lastFood, {
		onSome: (lastFood) => lastFood.id === petFood.id,
		onNone: () => false
	});

	// If last food updated its time, reschedule notification
	if (isLastFood && timeChanged) {
		await cvs.external(() =>
			PetFoodService.pipe(
				Effect.andThen((service) =>
					service.schedulePetFoodNotification(
						currentPet.id,
						petFood.id,
						DateTime.unsafeMake(time)
					)
				),
				Effect.scoped,
				runtime.runPromise
			)
		);
	}

	await ctx.reply('Ração alterada com sucesso!');
}) satisfies ConversationFn;

export const CorrectFoodCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('correctFood', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
