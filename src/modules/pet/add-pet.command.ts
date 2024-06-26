import type { ConversationFn } from '@grammyjs/conversations';
import type { MiddlewareFn } from 'grammy';

import { createPet } from '../../lib/entities/pet.js';

import invariant from 'tiny-invariant';
import type { Context } from '../../common/types/context.js';

export const addPetConversation = (async (conversation, ctx) => {
	const user = ctx.user;

	invariant(user, 'User is not defined');

	await ctx.reply('Qual o nome do seu pet?');

	const petName = await conversation.form.text((ctx) =>
		ctx.reply('Mande o nome do pet para eu salvar.')
	);

	// Adicionar pet no banco de dados
	await conversation.external(() => createPet(petName, user.id));

	await ctx.reply('Pet cadastrado com sucesso!');
}) satisfies ConversationFn<Context>;

export const AddPetCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('addPet');
}) satisfies MiddlewareFn<Context>;
