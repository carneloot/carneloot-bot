import { createConversation } from '@grammyjs/conversations';
import { Effect, Schema } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { AppServices } from '../../../app/layer.js';
import type { Context, ConversationFn } from '../../../common/types/context.js';
import { getUserDisplay } from '../../../common/utils/get-user-display.js';
import { showOptionsKeyboard } from '../../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../../common/utils/show-yes-or-no-question.js';
import type { Execute } from '../../execute.js';
import { conversationExternal } from '../conversation-external.js';
import {
	addCarer,
	answerPendingPetInvite,
	CaredPetDto,
	createPet,
	deletePet,
	getPendingPetInvites,
	getPetCarers,
	getPetCarerStatus,
	getUserByID,
	getUserByUsername,
	getUserCaredPets,
	getUserOwnedPets,
	PendingPetInviteDto,
	PetCarerDto,
	PetDto,
	removeCarer,
	UserDto,
} from './operations.js';

const Null = Schema.Null;
const userId = (user: Schema.Schema.Type<typeof UserDto>) =>
	Number(user.telegramID);

const getConversationUser = (
	cvs: Parameters<ConversationFn>[0],
	execute: Execute<AppServices>,
) =>
	conversationExternal(cvs, execute, UserDto, (context) =>
		Effect.succeed(context.user!),
	);

const getTextFromUser = async (
	cvs: Parameters<ConversationFn>[0],
	telegramID: number,
	otherwise: string,
) =>
	(
		await cvs.waitFrom(telegramID).andFor('message:text', {
			otherwise: (ctx) => ctx.reply(otherwise),
		})
	).message.text;

export const createPetConversations = (execute: Execute<AppServices>) => {
	const addPetConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);

		await ctx.reply('Qual o nome do seu pet?');
		const petName = await getTextFromUser(
			cvs,
			userId(user),
			'Mande o nome do pet para eu salvar.',
		);

		await conversationExternal(cvs, execute, Null, () =>
			createPet(petName, user.id),
		);
		await ctx.reply('Pet cadastrado com sucesso!');
	}) satisfies ConversationFn;

	const deletePetConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserOwnedPets(user.id),
		);
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha um pet para deletar:',
			userId: userId(user),
		})(cvs, ctx);
		const answer = await showYesOrNoQuestion(
			`Você tem certeza que deseja deletar o pet ${pet.name}?`,
			userId(user),
		)(cvs, ctx);

		if (answer) {
			await conversationExternal(cvs, execute, Null, () => deletePet(pet.id));
			await ctx.reply('Pet deletado!');
		}
	}) satisfies ConversationFn;

	const addCarerConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserOwnedPets(user.id),
		);
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha um pet para adicionar um cuidador',
			userId: userId(user),
		})(cvs, ctx);

		await ctx.reply(
			`Você escolheu o pet ${pet.name}. Agora, quem vai ser o cuidador?`,
		);
		const carerUsername = await getTextFromUser(
			cvs,
			userId(user),
			'Mande o usuário do cuidador para eu salvar.',
		);

		if (carerUsername === user.username) {
			await ctx.reply('Você não pode adicionar a si mesmo como cuidador.');
			return;
		}

		const carer = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(UserDto),
			() => getUserByUsername(carerUsername.replace(/^@/, '')),
		);

		if (!carer) {
			await ctx.reply(
				'Usuário não encontrado no banco de dados. Peça para o cuidador se cadastrar.',
			);
			return;
		}

		const status = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(Schema.Literals(['pending', 'accepted', 'rejected'])),
			() => getPetCarerStatus(pet.id, carer.id),
		);

		if (status) {
			const message =
				status === 'pending'
					? 'O cuidador já foi adicionado, mas ainda não aceitou o convite.'
					: status === 'accepted'
						? 'O cuidador já foi adicionado.'
						: 'O cuidador já foi adicionado, e recusou o convite.';
			await ctx.reply(message);
			return;
		}

		await conversationExternal(cvs, execute, Null, () =>
			addCarer(pet.id, carer.id),
		);
		await conversationExternal(cvs, execute, Null, (context) =>
			Effect.promise(() =>
				context.api.sendMessage(
					Number(carer.telegramID),
					`${getUserDisplay(user)} te convidou para cuidar de ${pet.name}. Aceite o convite em /convites_pet.`,
				),
			).pipe(Effect.as(null)),
		);
		await ctx.reply('O convite foi enviado para o cuidador.');
	}) satisfies ConversationFn;

	const listCarersConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserOwnedPets(user.id),
		);
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha um pet:',
			userId: userId(user),
		})(cvs, ctx);
		const invites = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetCarerDto),
			() => getPetCarers(pet.id),
		);

		if (invites.length === 0) {
			await ctx.reply('Este pet não tem cuidadores');
			return;
		}

		const carers = invites.map((invite) => {
			const status =
				invite.status === 'accepted'
					? 'aceito'
					: invite.status === 'rejected'
						? 'rejeitado'
						: 'pendente';
			return `${getUserDisplay(invite.carer)} (${status})`;
		});
		await ctx.reply(`Cuidadores:\n${carers.join('\n')}`, {
			parse_mode: 'HTML',
		});
	}) satisfies ConversationFn;

	const removeCarerConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserOwnedPets(user.id),
		);
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha um pet para remover um cuidador:',
			userId: userId(user),
		})(cvs, ctx);
		const invites = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetCarerDto),
			() => getPetCarers(pet.id),
		);

		if (invites.length === 0) {
			await ctx.reply('Este pet não tem cuidadores');
			return;
		}

		const invite = await showOptionsKeyboard({
			values: invites,
			labelFn: (invite) => {
				const status =
					invite.status === 'accepted'
						? 'aceito'
						: invite.status === 'rejected'
							? 'rejeitado'
							: 'pendente';
				return `${getUserDisplay(invite.carer)} (${status})`;
			},
			message: 'Escolha um cuidador para remover:',
			userId: userId(user),
		})(cvs, ctx);

		await conversationExternal(cvs, execute, Null, () =>
			removeCarer(pet.id, invite.carer.id),
		);
		await ctx.reply('Cuidador removido');
		await conversationExternal(cvs, execute, Null, (context) =>
			Effect.promise(() =>
				context.api.sendMessage(
					Number(invite.carer.telegramID),
					`Você foi removido como cuidador do pet ${pet.name}`,
				),
			).pipe(Effect.as(null)),
		);
	}) satisfies ConversationFn;

	const petInvitesConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const invites = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PendingPetInviteDto),
			() => getPendingPetInvites(user.id),
		);

		if (!invites.length) {
			await ctx.reply('Você não tem convites pendentes.');
			return;
		}

		const invite = await showOptionsKeyboard({
			values: invites,
			rowNum: 1,
			labelFn: (invite) =>
				`${invite.petName} (${getUserDisplay(invite.petOwner)})`,
			message:
				'Você tem convites pendentes para os seguintes pets. Escolha um para aceitar ou recusar:',
			userId: userId(user),
		})(cvs, ctx);
		const answer = await showYesOrNoQuestion(
			`Você aceita cuidar do pet ${invite.petName}?`,
			userId(user),
		)(cvs, ctx);

		await conversationExternal(cvs, execute, Null, () =>
			answerPendingPetInvite(invite.id, answer ? 'accepted' : 'rejected'),
		);
		await ctx.reply(`Você ${answer ? 'aceitou' : 'recusou'} o convite!`);
		await conversationExternal(cvs, execute, Null, (context) =>
			Effect.promise(() =>
				context.api.sendMessage(
					Number(invite.petOwner.telegramID),
					`O cuidador ${getUserDisplay(user)} ${
						answer ? 'aceitou' : 'recusou'
					} o convite para cuidar do pet ${invite.petName}`,
				),
			).pipe(Effect.as(null)),
		);
	}) satisfies ConversationFn;

	const stopCaringConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(CaredPetDto),
			() => getUserCaredPets(user.id),
		);

		if (!pets.length) {
			await ctx.reply('Você não está cuidando de nenhum pet');
			return;
		}

		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha um pet para parar de cuidar:',
			userId: userId(user),
		})(cvs, ctx);
		const answer = await showYesOrNoQuestion(
			'Tem certeza que deseja parar de cuidar deste pet?',
			userId(user),
		)(cvs, ctx);

		if (!answer) return;

		await conversationExternal(cvs, execute, Null, () =>
			removeCarer(pet.id, user.id),
		);
		await ctx.reply('Você parou de cuidar deste pet');
		const owner = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(UserDto),
			() => getUserByID(pet.ownerID),
		);

		if (owner) {
			await conversationExternal(cvs, execute, Null, (context) =>
				Effect.promise(() =>
					context.api.sendMessage(
						Number(owner.telegramID),
						`O cuidador ${getUserDisplay(user)} parou de cuidar do pet ${pet.name}`,
					),
				).pipe(Effect.as(null)),
			);
		}
	}) satisfies ConversationFn;

	return {
		addPetConversation,
		deletePetConversation,
		addCarerConversation,
		removeCarerConversation,
		listCarersConversation,
		petInvitesConversation,
		stopCaringConversation,
	} as const;
};

export const createPetCommand =
	(name: string, options?: { overwrite?: boolean }): MiddlewareFn<Context> =>
	async (ctx) => {
		if (!ctx.user) {
			await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
			return;
		}

		await ctx.conversation.enter(name, options);
	};

export const registerPetConversations = (
	execute: Execute<AppServices>,
): MiddlewareFn<Context>[] => {
	const conversations = createPetConversations(execute);
	return [
		createConversation(conversations.addPetConversation, 'addPet'),
		createConversation(conversations.deletePetConversation, 'deletePet'),
		createConversation(conversations.addCarerConversation, 'addCarer'),
		createConversation(conversations.removeCarerConversation, 'removeCarer'),
		createConversation(conversations.listCarersConversation, 'listCarers'),
		createConversation(conversations.petInvitesConversation, 'petInvites'),
		createConversation(conversations.stopCaringConversation, 'stopCaring'),
	];
};
