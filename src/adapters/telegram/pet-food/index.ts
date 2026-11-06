import { createConversation } from '@grammyjs/conversations';
import { Reactions } from '@grammyjs/emoji';
import { getUnixTime } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { DateTime, Duration, Effect, Option, Result, Schema } from 'effect';
import type { MiddlewareFn } from 'grammy';
import Qty from 'js-quantities';

import type { AppServices } from '../../../app/layer.js';
import type {
	Context,
	ConversationContext,
	ConversationFn,
} from '../../../common/types/context.js';
import { getDailyFromTo } from '../../../common/utils/get-daily-from-to.js';
import { parsePetFoodWeightAndTime } from '../../../common/utils/parse-pet-food-weight-and-time.js';
import { showOptionsKeyboard } from '../../../common/utils/show-options-keyboard.js';
import { showYesOrNoQuestion } from '../../../common/utils/show-yes-or-no-question.js';
import type { PetID } from '../../../lib/database/schema.js';
import { sendAddedFoodNotification } from '../../../modules/pet-food/utils/send-added-food-notification.js';
import type { Execute } from '../../execute.js';
import { conversationExternal } from '../conversation-external.js';
import {
	addFood,
	AddedFoodDto,
	DayStartDto,
	deleteFood,
	deleteNotificationDelay,
	EmptyOutcome,
	FoodEntryDto,
	getDayStart,
	getFoodEntries,
	getNotificationDelay,
	getUserOwnedPets,
	getUserPets,
	NotificationDelayDto,
	PetDto,
	setDayStart,
	setNotificationDelay,
	updateFood,
	UserDto,
} from './operations.js';

const hoursOptions = Array.from({ length: 12 }, (_, i) => ({
	value: i,
	label: `${i}h`,
}));
const DurationFromString = Schema.decodeUnknownOption(
	Schema.DurationFromString,
);

const getUser = (context: Context) => context.user;
const userId = (user: { readonly telegramID: string }) =>
	Number(user.telegramID);
const getUserDisplay = (user: {
	readonly username: string | null;
	readonly firstName: string;
	readonly lastName: string | null;
}) =>
	user.username
		? `@${user.username}`
		: [user.firstName, user.lastName].filter(Boolean).join(' ');

const requireUser = async (ctx: Context) => {
	const user = getUser(ctx);
	if (!user)
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
	return user;
};

const getConversationUser = (
	cvs: Parameters<ConversationFn>[0],
	execute: Execute<AppServices>,
) =>
	conversationExternal(cvs, execute, UserDto, (context) =>
		Effect.succeed(context.user!),
	);

export const createPetFoodConversations = (execute: Execute<AppServices>) => {
	const setDayStartConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserOwnedPets(user.id),
		);
		if (!pets.length)
			return void (await ctx.reply('Você ainda não cadastrou nenhum pet.'));
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Escolha o pet para configurar:',
			userId: userId(user),
		})(cvs, ctx);
		const dayStart = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(DayStartDto),
			() => getDayStart(pet.id),
		);
		const message = dayStart
			? `O horário de início atual do pet ${pet.name} é ${dayStart.hour}h no fuso horário "${dayStart.timezone}".`
			: `Você ainda não definiu um horário de início do dia para ${pet.name}.`;
		if (
			!(await showYesOrNoQuestion(
				`${message} Deseja ${dayStart ? 'alterar' : 'adicionar'}?`,
				userId(user),
			)(cvs, ctx))
		)
			return void (await ctx.replyWithEmoji`Ok ${'smiling_face_with_smiling_eyes'}`);
		const hour = await showOptionsKeyboard({
			values: hoursOptions,
			labelFn: (hour) => hour.label,
			message: 'Escolha o horário de início do dia:',
			keyboardType: 'custom',
			rowNum: 4,
		})(cvs, ctx);
		const timezone = await showOptionsKeyboard({
			values: (await import('@vvo/tzdb')).getTimeZones(),
			labelFn: (tz) => tz.name,
			message: 'Escolha o fuso horário de início do dia:',
			keyboardType: 'custom',
			rowNum: 4,
		})(cvs, ctx);
		await conversationExternal(cvs, execute, EmptyOutcome, () =>
			setDayStart(pet.id, { hour: hour.value, timezone: timezone.name }),
		);
		await ctx.reply(
			`O horário de início do dia do pet ${pet.name} foi definido para ${hour.value}h no fuso horário "${timezone.name}".`,
		);
	}) satisfies ConversationFn;

	const setNotificationDelayConversation = (async (cvs, ctx) => {
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
			message: 'Escolha o pet:',
			userId: userId(user),
		})(cvs, ctx);
		const delay = await conversationExternal(
			cvs,
			execute,
			NotificationDelayDto,
			() => getNotificationDelay(pet.id),
		);
		await ctx.reply(
			Option.match(delay, {
				onSome: (value) =>
					`O atraso de notificação para ${pet.name} é de ${Duration.format(value)}.`,
				onNone: () =>
					'Você ainda não definiu um atraso de notificação para este pet.',
			}),
		);
		const answer = Option.isNone(delay)
			? (await showYesOrNoQuestion(
					'Deseja definir um atraso de notificação?',
					userId(user),
				)(cvs, ctx))
				? 'Alterar'
				: undefined
			: await showOptionsKeyboard({
					values: ['Alterar', 'Excluir'] as const,
					labelFn: (value) => value,
					message: 'O que você deseja fazer?',
					userId: userId(user),
				})(cvs, ctx);
		if (!answer)
			return void (await ctx.reply(
				ctx.emoji`Okay ${'beaming_face_with_smiling_eyes'}`,
			));
		if (answer === 'Alterar') {
			await ctx.reply(
				'Digite o novo atraso de notificação no formato [número] [unidade (em ingles)]:',
			);
			const response = await cvs.waitUntil(
				async (input) =>
					DurationFromString(input.message?.text).pipe(Option.isSome),
				{
					otherwise: (input) =>
						input.reply(
							'Formato inválido. Envie uma duração no formato [número] [unidade (em ingles)].',
						),
				},
			);
			const text = response.message?.text;
			if (!text) return;
			const newDelay = DurationFromString(text);
			if (Option.isNone(newDelay)) return;
			await conversationExternal(cvs, execute, EmptyOutcome, () =>
				setNotificationDelay(pet.id, newDelay.value),
			);
			await ctx.reply(
				`O atraso de notificação para ${pet.name} foi definido para ${text}.`,
			);
			return;
		}
		if (
			!(await showYesOrNoQuestion(
				'Tem certeza que deseja excluir o atraso de notificação?\nIsso irá parar as notificações.',
				userId(user),
			)(cvs, ctx))
		)
			return;
		await conversationExternal(cvs, execute, EmptyOutcome, () =>
			deleteNotificationDelay(pet.id),
		);
		await ctx.reply(
			'Atraso de notificação excluído e notificação desabilitada.',
		);
	}) satisfies ConversationFn;

	const getFoodSelection = async (
		cvs: Parameters<ConversationFn>[0],
		ctx: ConversationContext,
		user: Schema.Schema.Type<typeof UserDto>,
	) => {
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserPets(user.id),
		);
		if (!pets.length) {
			await ctx.reply('Você não possui nenhum pet');
			return;
		}
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (pet) => pet.name,
			message: 'Selecione o pet para apagar a comida:',
			rowNum: 2,
			userId: userId(user),
		})(cvs, ctx);
		const dayStart = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(DayStartDto),
			() => getDayStart(pet.id),
		);
		if (!dayStart) {
			await ctx.reply(
				'Por favor, configure o horário de início do dia para o pet.',
			);
			return;
		}
		if (!ctx.message) return;
		const { from, to } = getDailyFromTo(
			DateTime.makeUnsafe(ctx.message.date * 1000),
			dayStart,
		);
		const foods = await conversationExternal(
			cvs,
			execute,
			Schema.Array(FoodEntryDto),
			() => getFoodEntries(pet.id, from, to),
		);
		return { pet, dayStart, foods };
	};

	const deleteFoodConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const selection = await getFoodSelection(cvs, ctx, user);
		if (!selection) return;
		if (!selection.foods.length)
			return void (await ctx.reply('Ainda não foi colocado ração hoje'));
		const food = await showOptionsKeyboard({
			values: selection.foods,
			labelFn: (value) =>
				`${Qty(value.quantity, 'g')} | ${utcToZonedTime(value.time, selection.dayStart.timezone).toLocaleString('pt-BR')} | ${getUserDisplay(value.user)}`,
			message: 'Escolha a ração para deletar:',
			rowNum: 1,
			addCancel: true,
			userId: userId(user),
		})(cvs, ctx);
		if (!food) return void (await ctx.reply('Operação cancelada'));
		await conversationExternal(cvs, execute, EmptyOutcome, () =>
			deleteFood(food.id),
		);
		await ctx.reply('Ração deletada com sucesso!');
	}) satisfies ConversationFn;

	const correctFoodConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const selection = await getFoodSelection(cvs, ctx, user);
		if (!selection) return;
		if (!selection.foods.length)
			return void (await ctx.reply('Ainda não foi colocado ração hoje'));
		const food = await showOptionsKeyboard({
			values: selection.foods,
			labelFn: (value) =>
				`${Qty(value.quantity, 'g')} | ${utcToZonedTime(value.time, selection.dayStart.timezone).toLocaleString('pt-BR')} | ${getUserDisplay(value.user)}`,
			message: 'Escolha a ração para deletar:',
			rowNum: 1,
			addCancel: true,
			userId: userId(user),
		})(cvs, ctx);
		if (!food) return void (await ctx.reply('Operação cancelada'));
		await ctx.reply('Qual será a nova quantidade de ração (e/ou horário)?');
		const messageTime = getUnixTime(food.time);
		const reply = await cvs.waitUntil(
			async (input) =>
				execute(
					parsePetFoodWeightAndTime({
						messageMatch: input.message?.text,
						messageTime,
						timezone: selection.dayStart.timezone,
					}).pipe(Effect.result),
				).then(Result.isSuccess),
			{
				otherwise: (input) =>
					input.reply('Envie a quantidade de ração colocada.'),
			},
		);
		const result = await execute(
			parsePetFoodWeightAndTime({
				messageMatch: reply.message?.text,
				messageTime,
				timezone: selection.dayStart.timezone,
			}),
		);
		await conversationExternal(cvs, execute, EmptyOutcome, () =>
			updateFood(
				selection.pet.id,
				food.id,
				result.quantity.scalar,
				result.time,
				result.timeChanged,
			),
		);
		await ctx.reply('Ração alterada com sucesso!');
	}) satisfies ConversationFn;

	const addFoodConversation = (async (cvs, ctx) => {
		const user = await getConversationUser(cvs, execute);
		const pets = await conversationExternal(
			cvs,
			execute,
			Schema.Array(PetDto),
			() => getUserPets(user.id),
		);
		const pet = await showOptionsKeyboard({
			values: pets,
			labelFn: (value) => value.name,
			message: 'Selecione o pet para adicionar a comida:',
			rowNum: 2,
			userId: userId(user),
		})(cvs, ctx);
		const dayStart = await conversationExternal(
			cvs,
			execute,
			Schema.NullOr(DayStartDto),
			() => getDayStart(pet.id),
		);
		if (!dayStart)
			return void (await ctx.reply(
				'Por favor, configure o horário de início do dia para o pet.',
			));
		await ctx.reply(
			`Certo, voce colocou ração para o pet ${pet.name}. Envie a quantidade. Caso não foi colocado agora, informe também o horário.`,
		);
		const response = await cvs.waitUntil(
			async (input) =>
				execute(
					parsePetFoodWeightAndTime({
						messageMatch: input.message?.text,
						messageTime: input.message?.date ?? 0,
						timezone: dayStart.timezone,
					}).pipe(Effect.result),
				).then(Result.isSuccess),
			{
				otherwise: (input) =>
					input.reply('Envie a quantidade de ração colocada'),
			},
		);
		if (!response.message) return;
		const result = await execute(
			parsePetFoodWeightAndTime({
				messageMatch: response.message.text,
				messageTime: response.message.date,
				timezone: dayStart.timezone,
			}),
		);
		const added = await conversationExternal(cvs, execute, AddedFoodDto, () =>
			addFood(
				pet,
				response.message!.message_id,
				user.id,
				result.time,
				result.quantity,
				result.timeChanged,
				dayStart,
			).pipe(
				Effect.match({
					onFailure: (error) => ({
						message: error._tag === 'DuplicatedEntryError' ? error.message : '',
					}),
					onSuccess: (value) => value,
				}),
			),
		);
		if (!added.message) return;
		await response.reply(added.message);
		await response.react(Reactions.thumbs_up);
		await conversationExternal(cvs, execute, EmptyOutcome, (context) =>
			sendAddedFoodNotification({
				id: pet.id as PetID,
				quantity: result.quantity,
				user: context.user!,
				time: result.timeChanged ? result.time : undefined,
			})(context).pipe(Effect.as(null)),
		);
	}) satisfies ConversationFn;

	return {
		addFoodConversation,
		correctFoodConversation,
		deleteFoodConversation,
		setDayStartConversation,
		setNotificationDelayConversation,
	} as const;
};

export const registerPetFoodConversations = (execute: Execute<AppServices>) => {
	const conversations = createPetFoodConversations(execute);
	return [
		createConversation(conversations.setDayStartConversation, 'setDayStart'),
		createConversation(
			conversations.setNotificationDelayConversation,
			'setNotificationDelay',
		),
		createConversation(conversations.addFoodConversation, 'addFood'),
		createConversation(conversations.deleteFoodConversation, 'deleteFood'),
		createConversation(conversations.correctFoodConversation, 'correctFood'),
	];
};

const enter =
	(
		name:
			| 'setDayStart'
			| 'setNotificationDelay'
			| 'addFood'
			| 'deleteFood'
			| 'correctFood',
		overwrite = false,
	): MiddlewareFn<Context> =>
	async (ctx) => {
		if (!(await requireUser(ctx))) return;
		await ctx.conversation.enter(name, { overwrite });
	};
export const SetDayStartCommand = enter('setDayStart', true);
export const SetNotificationDelayCommand = enter('setNotificationDelay', true);
export const AddFoodCommand = enter('addFood');
export const DeleteFoodCommand = enter('deleteFood', true);
export const CorrectFoodCommand = enter('correctFood', true);
