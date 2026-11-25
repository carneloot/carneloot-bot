import { Array as A, Effect, Order, pipe } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Context } from '../../common/types/context.js';
import { PetRepository } from '../../lib/repositories/pet.js';
import type { Execute } from '../execute.js';

export const createListPetsCommand =
	(execute: Execute<PetRepository>): MiddlewareFn<Context> =>
	async (ctx) => {
		const user = ctx.user;
		if (!user) {
			await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
			return;
		}

		const pets = await execute(
			Effect.gen(function* () {
				const petRepository = yield* PetRepository;
				const ownedPets = yield* petRepository.getUserOwnedPets(user.id);
				const caredPets = yield* petRepository.getUserCaredPets(user.id);

				return [
					...ownedPets.map((pet) => pet.name),
					...caredPets.map((pet) => `${pet.name} (cuidando)`),
				];
			}),
		);

		if (pets.length === 0) {
			await ctx.reply('Você não tem pets');
			return;
		}

		await ctx.reply(
			pipe(
				pets,
				A.sort(Order.String),
				A.map((name, index) => `${index + 1}. ${name}`),
				A.join('\n'),
			),
			{ parse_mode: 'HTML' },
		);
	};
