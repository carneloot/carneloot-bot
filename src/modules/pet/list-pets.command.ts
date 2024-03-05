import { MiddlewareFn } from 'grammy';

import { getUserCaredPets, getUserOwnedPets } from '../../lib/entities/pet.js';

import { Context } from '../../common/types/context.js';

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
		pets
			.toSorted()
			.map((name, index) => `${index + 1}. ${name}`)
			.join('\n'),
		{
			parse_mode: 'HTML'
		}
	);
}) satisfies MiddlewareFn<Context>;
