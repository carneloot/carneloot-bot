import { conversations } from '@grammyjs/conversations';
import { emojiParser } from '@grammyjs/emoji';
import { sequentialize } from '@grammyjs/runner';
import { Effect, Redacted } from 'effect';
import { Bot } from 'grammy';

import type { AppServices } from '../../app/layer.js';
import { Env } from '../../common/env.js';
import { Module } from '../../common/module/module.js';
import {
	getCommandForHelp,
	getDescriptionForHelp,
} from '../../common/types/command.js';
import type { Context } from '../../common/types/context.js';
import { createForwardToOwnerMiddleware } from '../../middlewares/forward-to-owner.middleware.js';
import { createGenericErrorMiddleware } from '../../middlewares/generic-error.middleware.js';
import { createUserMiddleware } from '../../middlewares/user.middleware.js';
import type { Execute } from '../execute.js';
import {
	createApiKeyConfirmationMenu,
	createGenerateApiKeyCommand,
	createSignupCommand,
} from './auth.js';
import { createCafeInvCommand } from './commands/cafe-inv.js';
import { createCafeCommand } from './commands/cafe.js';
import { createPingCommand } from './commands/ping.js';
import { createWhatsCommand } from './commands/whats.js';
import type { ConversationStorage } from './conversation-storage.js';
import { installGrammyDebugLogger } from './debug.js';
import { createListPetsCommand } from './list-pets.js';
import { createAddFoodAllCommand } from './pet-food/add-food-all.js';
import { createFoodStatusCommand } from './pet-food/food-status.js';
import {
	AddFoodCommand,
	CorrectFoodCommand,
	DeleteFoodCommand,
	registerPetFoodConversations,
	SetDayStartCommand,
	SetNotificationDelayCommand,
} from './pet-food/index.js';
import { createPetCommand, registerPetConversations } from './pets/index.js';
import { createReplyMiddleware } from './reply.js';

export type TelegramBot = {
	readonly bot: Bot<Context>;
	readonly checkHealth: () => Promise<void>;
	readonly setWebhook: (url: string) => Promise<unknown>;
	readonly setCommands: () => Promise<void>;
};

export const createBot = (
	execute: Execute<AppServices>,
	conversationStorage: ConversationStorage,
): TelegramBot => {
	installGrammyDebugLogger(execute);
	const bot = new Bot<Context>(Env.BOT_TOKEN.pipe(Redacted.value));
	const myEmojiParser = emojiParser();
	const userMiddleware = createUserMiddleware(execute);
	const apiKeyConfirmationMenu = createApiKeyConfirmationMenu(execute);
	const pingCommand = createPingCommand(execute);
	const whatsCommand = createWhatsCommand(execute);
	const cafeCommand = createCafeCommand(execute);
	const cafeInvCommand = createCafeInvCommand(execute);

	bot.use((ctx, next) =>
		execute(
			Effect.promise(() => next()).pipe(
				Effect.withSpan('telegram.update', {
					attributes: {
						'telegram.chat.id': ctx.chat?.id ?? 'unknown',
						'telegram.update.id': ctx.update.update_id,
						'telegram.update.type':
							Object.keys(ctx.update).find((key) => key !== 'update_id') ??
							'unknown',
					},
				}),
			),
		),
	);

	bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

	bot.use((ctx, next) => {
		const command = ctx.message?.text?.match(/^\/([^\s@]+)/)?.[1];
		if (!command) return next();

		return execute(
			Effect.promise(() => next()).pipe(
				Effect.withSpan('telegram.command', {
					attributes: { 'telegram.command.name': command },
				}),
			),
		);
	});

	bot.use(
		conversations({
			storage: conversationStorage,
			plugins: [myEmojiParser],
		}),
	);

	bot.command('cancelar', async (ctx) => {
		await ctx.conversation.exitAll();
		await ctx.reply('Operação cancelada', {
			reply_markup: { remove_keyboard: true },
		});
	});

	bot.use(myEmojiParser);

	bot.use(createGenericErrorMiddleware(execute));

	bot.command('start', (ctx) => ctx.reply('É nóis'));
	bot.on('message', userMiddleware, createReplyMiddleware(execute));

	bot.command(pingCommand.command, pingCommand);
	bot.command(whatsCommand.command, whatsCommand);
	bot.command(cafeCommand.command, cafeCommand);
	bot.command(cafeInvCommand.command, cafeInvCommand);

	bot.use(apiKeyConfirmationMenu);
	bot.command('cadastrar', createSignupCommand(execute));
	bot.command(
		'gerar_chave',
		userMiddleware,
		createGenerateApiKeyCommand(execute, apiKeyConfirmationMenu),
	);
	bot.command('listar_pets', userMiddleware, createListPetsCommand(execute));
	bot.use(...registerPetConversations(execute));
	bot.command('adicionar_pet', userMiddleware, createPetCommand('addPet'));
	bot.command('deletar_pet', userMiddleware, createPetCommand('deletePet'));
	bot.command(
		'adicionar_cuidador',
		userMiddleware,
		createPetCommand('addCarer', { overwrite: true }),
	);
	bot.command(
		'remover_cuidador',
		userMiddleware,
		createPetCommand('removeCarer', { overwrite: true }),
	);
	bot.command(
		'listar_cuidadores',
		userMiddleware,
		createPetCommand('listCarers', { overwrite: true }),
	);
	bot.command(
		'convites_pet',
		userMiddleware,
		createPetCommand('petInvites', { overwrite: true }),
	);
	bot.command(
		'parar_de_cuidar_pet',
		userMiddleware,
		createPetCommand('stopCaring'),
	);
	bot.use(...registerPetFoodConversations(execute));
	const petFoodModule = new Module<Context>(
		'',
		'Operações de rastreamento de ração',
	);
	petFoodModule.setCommand(
		'configurar_inicio_dia',
		'Configura o horário de início do dia para rastreamento de ração',
		userMiddleware,
		SetDayStartCommand,
	);
	petFoodModule.setCommand(
		'configurar_atraso_notificacao',
		'Configura o atraso de notificação para rastreamento de ração',
		userMiddleware,
		SetNotificationDelayCommand,
	);
	petFoodModule.setCommand(
		'colocar_racao',
		'Adiciona ração ao rastreamento de ração',
		userMiddleware,
		AddFoodCommand,
	);
	petFoodModule.setCommand(
		'deletar_racao',
		'Deleta ração do rastreamento de ração',
		userMiddleware,
		DeleteFoodCommand,
	);
	petFoodModule.setCommand(
		'corrigir_racao',
		'Corrige o valor e tempo de um comando de ração mandado anteriormente',
		userMiddleware,
		CorrectFoodCommand,
	);
	petFoodModule.setCommand(
		'status_racao',
		'Exibe o status atual do rastreamento de ração',
		userMiddleware,
		createFoodStatusCommand(execute),
	);
	petFoodModule.setCommand(
		['colocar_racao_todos', 'todos'],
		'Adiciona ração ao rastreamento de ração para todos os seus pets de uma vez',
		userMiddleware,
		createAddFoodAllCommand(execute),
	);
	bot.use(petFoodModule);

	if (Env.TELEGRAM_FORWARD_USERNAMES && Env.OWNER_TELEGRAM_ID) {
		bot.on(
			'message',
			createForwardToOwnerMiddleware({
				ownerChatId: Env.OWNER_TELEGRAM_ID,
				usernames: Env.TELEGRAM_FORWARD_USERNAMES,
			}),
		);
	}

	bot
		.on(':text')
		.hears(/hello/i, (ctx) =>
			ctx.replyWithPhoto(
				'https://i.kym-cdn.com/photos/images/original/001/475/422/473.jpg',
			),
		);

	bot.catch((error) =>
		execute(
			Effect.logError('Telegram update failed').pipe(
				Effect.annotateLogs({
					chatId: error.ctx.chat?.id ?? 'unknown',
					error: String(error.error),
					updateId: error.ctx.update.update_id,
				}),
			),
		).catch((reportingError) => {
			void execute(
				Effect.logError(
					'Could not report Telegram update error',
					reportingError,
				),
			).catch(() => undefined);
		}),
	);

	return {
		bot,
		checkHealth: async () => {
			await bot.api.getMe();
		},
		setWebhook: (url) => bot.api.setWebhook(url),
		setCommands: async () => {
			const commands = [
				{
					command: getCommandForHelp(pingCommand),
					description: getDescriptionForHelp(pingCommand),
				},
				{
					command: getCommandForHelp(whatsCommand),
					description: getDescriptionForHelp(whatsCommand),
				},
				{
					command: getCommandForHelp(cafeCommand),
					description: getDescriptionForHelp(cafeCommand),
				},
				{
					command: getCommandForHelp(cafeInvCommand),
					description: getDescriptionForHelp(cafeInvCommand),
				},
				{
					command: 'cancelar',
					description: 'Cancela a operação atual',
				},
				{
					command: 'cadastrar',
					description: 'Cadastra a sua conta no banco de dados',
				},
				{
					command: 'gerar_chave',
					description: 'Gera uma nova api-key para o usuario',
				},
				{
					command: 'listar_pets',
					description: 'Lista os seus pets',
				},
				...Module.getCommandList(),
			];

			await bot.api.setMyCommands(commands, { language_code: 'pt' });
		},
	};
};
