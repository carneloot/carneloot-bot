import { DateTime, Duration, Effect, Option, Schema } from 'effect';
import type { MiddlewareFn } from 'grammy';

import invariant from 'tiny-invariant';

import type { Context, ConversationFn } from '../../common/types/context.js';
import { showOptionsKeyboard } from '../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../common/utils/show-yes-or-no-question.js';
import { ConfigService, setConfig } from '../../lib/entities/config.js';
import { getUserOwnedPets } from '../../lib/entities/pet.js';
import { PetFoodRepository } from '../../lib/repositories/pet-food.js';
import { PetFoodService } from '../../lib/services/pet-food.js';
import { runtime } from '../../runtime.js';

const ExternalDurationSchema = Schema.OptionFromUndefinedOr(
	Schema.DurationFromMillis
);

export const setNotificationDelayConversation = (async (cvs, ctx) => {
	const user = await cvs.external((ctx) => ctx.user);

	invariant(user, 'User is not defined');

	const pets = await cvs.external(() => getUserOwnedPets(user.id));

	const pet = await showOptionsKeyboard({
		values: pets,
		labelFn: (pet) => pet.name,
		message: 'Escolha o pet:'
	})(cvs, ctx);

	const duration = await cvs.external({
		task: () =>
			ConfigService.pipe(
				Effect.andThen((config) =>
					config.getConfig('pet', 'notificationDelay', pet.id)
				),
				Effect.asSome,
				Effect.catchTag('MissingConfigError', () => Effect.succeedNone),
				runtime.runPromise
			),
		beforeStore: Schema.encodePromise(ExternalDurationSchema),
		afterLoad: Schema.decodePromise(ExternalDurationSchema)
	});

	if (Option.isSome(duration)) {
		await ctx.reply(
			`O atraso de notificação para ${pet.name} é de ${Duration.format(duration.value)}.`
		);
	} else {
		await ctx.reply(
			'Você ainda não definiu um atraso de notificação para este pet.'
		);
	}

	let answer: 'Alterar' | 'Excluir' | undefined;
	if (Option.isNone(duration)) {
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
		await ctx.reply(ctx.emoji`Okay ${'beaming_face_with_smiling_eyes'}`);
		return;
	}

	if (answer === 'Alterar') {
		await ctx.reply(
			'Digite o novo atraso de notificação no formato [número] [unidade (em ingles)]:'
		);

		const durationResponse = await cvs.waitUntil(
			(ctx) => Duration.decodeUnknown(ctx.message?.text).pipe(Option.isSome),
			{
				otherwise: (ctx) =>
					ctx.reply(
						'Formato inválido. Envie uma duração no formato [número] [unidade (em ingles)].'
					)
			}
		);

		const newDurationString = durationResponse.message?.text;

		invariant(newDurationString, 'Duration string is not defined');

		const newDuration = Duration.decodeUnknown(newDurationString).pipe(
			Option.getOrThrow // This should always be true since it is checked inside the waitUntil
		);
		await cvs.external(() =>
			setConfig('pet', 'notificationDelay', pet.id, newDuration)
		);
		await ctx.reply(
			`O atraso de notificação para ${pet.name} foi definido para ${newDurationString}.`
		);

		await cvs.external(() =>
			Effect.gen(function* () {
				const petFoodRepository = yield* PetFoodRepository;
				const petFoodService = yield* PetFoodService;

				const lastPetFood = yield* petFoodRepository.getLastPetFood({
					petID: pet.id
				});

				if (Option.isSome(lastPetFood)) {
					yield* petFoodService.cancelPetFoodNotification(lastPetFood.value.id);
					yield* petFoodService.schedulePetFoodNotification(
						pet.id,
						lastPetFood.value.id,
						DateTime.unsafeMake(lastPetFood.value.time)
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
			const config = yield* ConfigService;
			const petFoodService = yield* PetFoodService;
			const petFoodRepository = yield* PetFoodRepository;

			yield* config.deleteConfig('pet', 'notificationDelay', pet.id);

			const lastPetFood = yield* petFoodRepository.getLastPetFood({
				petID: pet.id
			});

			if (Option.isSome(lastPetFood)) {
				yield* petFoodService.cancelPetFoodNotification(lastPetFood.value.id);
			}
		}).pipe(runtime.runPromise)
	);

	await ctx.reply('Atraso de notificação excluído e notificação desabilitada.');
}) satisfies ConversationFn;

export const SetNotificationDelayCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	await ctx.conversation.enter('setNotificationDelay', { overwrite: true });
}) satisfies MiddlewareFn<Context>;
