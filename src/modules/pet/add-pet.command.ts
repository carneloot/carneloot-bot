import type { MiddlewareFn } from 'grammy';
import invariant from 'tiny-invariant';

import { createPet } from '../../lib/entities/pet.js';

import type { Context, ConversationFn } from '../../common/types/context.js';

export const addPetConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	await ctx.reply('Qual o nome do seu pet?');

	const petName = await cvs.form.text((ctx) =>
		ctx.reply('Mande o nome do pet para eu salvar.')
	);

	// Adicionar pet no banco de dados
	await cvs.external(() => createPet(petName, user.id));

	await ctx.reply('Pet cadastrado com sucesso!');
}) satisfies ConversationFn;

export const AddPetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('addPet');
}) satisfies MiddlewareFn<Context>;
