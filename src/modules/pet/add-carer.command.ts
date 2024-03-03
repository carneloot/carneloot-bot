import type { ConversationFn } from '@grammyjs/conversations';

import { MiddlewareFn } from 'grammy';

import { addCarer, getUserOwnedPets, isUserCarer } from '../../lib/pet';
import { getUserByUsername } from '../../lib/user';

import { Context } from '../../common/types/context';
import { getUserDisplay } from '../../common/utils/get-user-display';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard';

export const addCarerConversation = (async (conversation, ctx) => {
	const pets = await conversation.external(() => getUserOwnedPets(ctx.user!.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha um pet para adicionar um cuidador'
	})(conversation, ctx);

	await ctx.reply(`Você escolheu o pet ${pet.name}. Agora, quem vai ser o cuidador?`);

	const carerUsername = await conversation.form.text((ctx) =>
		ctx.reply('Mande o usuário do cuidador para eu salvar.')
	);

	if (carerUsername === ctx.from?.username) {
		await ctx.reply('Você não pode adicionar a si mesmo como cuidador.');

		return;
	}

	const carer = await conversation.external(() =>
		getUserByUsername(carerUsername.replace(/^@/, ''))
	);

	if (!carer) {
		await ctx.reply(
			'Usuário não encontrado no banco de dados. Peça para o cuidador se cadastrar.'
		);
		return;
	}

	// Check if carer is already a carer for the pet
	const isCarerAlready = await conversation.external(() => isUserCarer(pet.id, carer.id));

	if (isCarerAlready) {
		let message: string;

		switch (isCarerAlready.status) {
			case 'pending':
				message = 'O cuidador já foi adicionado, mas ainda não aceitou o convite.';
				break;
			case 'accepted':
				message = 'O cuidador já foi adicionado.';
				break;
			case 'rejected':
				message = 'O cuidador já foi adicionado, e recusou o convite.';
				break;
		}

		await ctx.reply(message);
	} else {
		await conversation.external(() => addCarer(pet.id, carer.id));

		const owner = getUserDisplay(ctx.from!);

		await ctx.api.sendMessage(
			carer.telegramID,
			`${owner} te convidou para cuidar de ${pet.name}. Aceite o convite em /convites_pet.`
		);

		await ctx.reply('O convite foi enviado para o cuidador.');
	}
}) satisfies ConversationFn<Context>;

export const AddCarerCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('addCarer', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
