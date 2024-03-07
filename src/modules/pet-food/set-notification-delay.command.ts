import { ConversationFn } from '@grammyjs/conversations';

import { parse, serialize } from 'tinyduration';
import { MiddlewareFn } from 'grammy';

import { Context } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { getUserOwnedPets } from '../../lib/entities/pet.js';
import { deleteConfig, getConfig, setConfig } from '../../lib/entities/config.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import {
	cancelPetFoodNotification,
	getLastPetFood,
	schedulePetFoodNotification
} from '../../lib/entities/pet-food.js';

export const setNotificationDelayConversation = (async (cvs, ctx) => {
	const pets = await cvs.external(() => getUserOwnedPets(ctx.user!.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet:'
	})(cvs, ctx);

	const duration = await cvs.external(() => getConfig('pet', 'notificationDelay', pet.id));

	if (!duration) {
		await ctx.reply('Você ainda não definiu um atraso de notificação para este pet.');
	} else {
		await ctx.reply(`O atraso de notificação para ${pet.name} é de ${serialize(duration)}.`);
	}

	let answer: 'Alterar' | 'Excluir' | undefined;
	if (!duration) {
		const innerAnswer = await showYesOrNoQuestion('Deseja definir um atraso de notificação?')(
			cvs,
			ctx
		);

		if (innerAnswer) {
			answer = 'Alterar';
		}
	} else {
		answer = await showOptionsKeyboard({
			values: ['Alterar', 'Excluir'] as const,
			labelFn: (value) => value,
			message: 'O que você deseja fazer?'
		})(cvs, ctx);
	}

	if (!answer) {
		return;
	}

	if (answer === 'Alterar') {
		// TODO receber a duração em um formato mais human readable
		await ctx.reply('Digite o novo atraso de notificação no formato de ISO Duration:');

		const durationResponse = await cvs.waitUntil(
			(ctx) => {
				if (!ctx.message?.text) {
					return false;
				}

				try {
					parse(ctx.message.text);

					return true;
				} catch (err) {
					return false;
				}
			},
			(ctx) => ctx.reply('Formato inválido.')
		);
		const newDurationString = durationResponse.message!.text!;
		const newDuration = parse(newDurationString);
		await cvs.external(() => setConfig('pet', 'notificationDelay', pet.id, newDuration));
		await ctx.reply(
			`O atraso de notificação para ${pet.name} foi definido para ${newDurationString}.`
		);

		await cvs.external(async () => {
			const lastPetFood = await getLastPetFood(pet.id);
			if (lastPetFood) {
				await schedulePetFoodNotification(pet.id, lastPetFood.id, lastPetFood.time);
			}
		});

		return;
	}

	const shouldDelete = await showYesOrNoQuestion(
		'Tem certeza que deseja excluir o atraso de notificação?\nIsso irá parar as notificações.'
	)(cvs, ctx);

	if (!shouldDelete) {
		return;
	}

	await cvs.external(() => deleteConfig('pet', 'notificationDelay', pet.id));
	await cvs.external(async () => {
		const lastPetFood = await getLastPetFood(pet.id);
		if (lastPetFood) {
			await cancelPetFoodNotification(lastPetFood.id);
		}
	});

	await ctx.reply('Atraso de notificação excluído e notificação desabilitada.');
}) satisfies ConversationFn<Context>;

export const SetNotificationDelayCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('setNotificationDelay', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
