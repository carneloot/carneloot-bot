import { Array as A, Order, pipe } from 'effect';
import type { MiddlewareFn } from 'grammy';
import type { Context } from '../../common/types/context.js';
import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';

export const ListPetsCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const ownedPets = await getUserOwnedPets(ctx.user.id);
	const caredPets = await getUserCaredPets(ctx.user.id);

	const pets = [
		...ownedPets.map((pet) => pet.name),
		...caredPets.map((pet) => `${pet.name} (cuidando)`)
	];

	if (pets.length === 0) {
		await ctx.reply('Você não tem pets');
		return;
	}

	await ctx.reply(
		pipe(
			pets,
			A.sort(Order.string),
			A.map((name, index) => `${index + 1}. ${name}`),
			A.join('\n')
		),
		{
			parse_mode: 'HTML'
		}
	);
}) satisfies MiddlewareFn<Context>;
