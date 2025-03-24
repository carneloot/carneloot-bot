import type { ConversationFn } from '@grammyjs/conversations';

import { DateTime, Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';
import { parse, serialize } from 'tinyduration';

import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import {
	deleteConfigEffect,
	getConfig,
	setConfig
} from '../../lib/entities/config.js';
import { getLastPetFood } from '../../lib/entities/pet-food.js';
import { getUserOwnedPets } from '../../lib/entities/pet.js';
import { petFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';

export const setNotificationDelayConversation = (async (cvs, ctx) => {
	const user = ctx.user;

	invariant(user, 'User is not defined');

	const pets = await cvs.external(() => getUserOwnedPets(user.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet:'
	})(cvs, ctx);

	const duration = await cvs.external(() =>
		getConfig('pet', 'notificationDelay', pet.id)
	);

	if (!duration) {
		await ctx.reply(
			'Você ainda não definiu um atraso de notificação para este pet.'
		);
	} else {
		await ctx.reply(
			`O atraso de notificação para ${pet.name} é de ${serialize(duration)}.`
		);
	}

	let answer: 'Alterar' | 'Excluir' | undefined;
	if (!duration) {
		const innerAnswer = await showYesOrNoQuestion(
			'Deseja definir um atraso de notificação?'
		)(cvs, ctx);

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
		await ctx.reply(
			'Digite o novo atraso de notificação no formato de ISO Duration:'
		);

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
			(ctx) =>
				ctx.reply(
					'Formato inválido. Envie uma duração no formato ISO Duration.'
				)
		);

		const newDurationString = durationResponse.message?.text;

		invariant(newDurationString, 'Duration string is not defined');

		const newDuration = parse(newDurationString);
		await cvs.external(() =>
			setConfig('pet', 'notificationDelay', pet.id, newDuration)
		);
		await ctx.reply(
			`O atraso de notificação para ${pet.name} foi definido para ${newDurationString}.`
		);

		await cvs.external(() =>
			Effect.gen(function* () {
				const lastPetFood = yield* Effect.tryPromise(() =>
					getLastPetFood(pet.id)
				);

				if (lastPetFood) {
					yield* petFoodService.cancelPetFoodNotification(lastPetFood.id);
					yield* petFoodService.schedulePetFoodNotification(
						pet.id,
						lastPetFood.id,
						DateTime.unsafeMake(lastPetFood.time)
					);
				}
			}).pipe(runtime.runPromise)
		);

		return;
	}

	const shouldDelete = await showYesOrNoQuestion(
		'Tem certeza que deseja excluir o atraso de notificação?\nIsso irá parar as notificações.'
	)(cvs, ctx);

	if (!shouldDelete) {
		return;
	}

	await cvs.external(() =>
		Effect.gen(function* () {
			yield* deleteConfigEffect('pet', 'notificationDelay', pet.id);

			const lastPetFood = yield* Effect.tryPromise(() =>
				getLastPetFood(pet.id)
			);
			if (lastPetFood) {
				yield* petFoodService.cancelPetFoodNotification(lastPetFood.id);
			}
		}).pipe(runtime.runPromise)
	);

	await ctx.reply('Atraso de notificação excluído e notificação desabilitada.');
}) satisfies ConversationFn<Context>;

export const SetNotificationDelayCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('setNotificationDelay', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
