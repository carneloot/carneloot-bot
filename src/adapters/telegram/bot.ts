import { conversations } from '@grammyjs/conversations';
import { emojiParser } from '@grammyjs/emoji';
import { sequentialize } from '@grammyjs/runner';
import { Effect, Redacted } from 'effect';
import { Bot } from 'grammy';

import type { AppServices } from '../../app/layer.js';
import { CafeCommand } from '../../commands/cafe-command.js';
import { CafeInvCommand } from '../../commands/cafe-inv-command.js';
import { PingCommand } from '../../commands/ping.command.js';
import { WhatsCommand } from '../../commands/whats-command.js';
import { Env } from '../../common/env.js';
import { Module } from '../../common/module/module.js';
import {
	getCommandForHelp,
	getDescriptionForHelp,
} from '../../common/types/command.js';
import type { Context } from '../../common/types/context.js';
import { createForwardToOwnerMiddleware } from '../../middlewares/forward-to-owner.middleware.js';
import { GenericErrorMiddleware } from '../../middlewares/generic-error.middleware.js';
import { replyMiddleware } from '../../middlewares/reply.middleware.js';
import { createUserMiddleware } from '../../middlewares/user.middleware.js';
import { createPetFoodModule } from '../../modules/pet-food/pet-food.module.js';
import { createPetModule } from '../../modules/pet/pet.module.js';
import type { Execute } from '../execute.js';
import type { ConversationStorage } from './conversation-storage.js';
import {
	createApiKeyConfirmationMenu,
	createGenerateApiKeyCommand,
	createSignupCommand,
} from './auth.js';
import { createListPetsCommand } from './list-pets.js';

export type TelegramBot = {
	readonly bot: Bot<Context>;
	readonly setWebhook: (url: string) => Promise<unknown>;
	readonly setCommands: () => Promise<void>;
};

export const createBot = (
	execute: Execute<AppServices>,
	conversationStorage: ConversationStorage,
): TelegramBot => {
	const bot = new Bot<Context>(Env.BOT_TOKEN.pipe(Redacted.value));
	const myEmojiParser = emojiParser();
	const userMiddleware = createUserMiddleware(execute);
	const apiKeyConfirmationMenu = createApiKeyConfirmationMenu(execute);

	bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

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

	bot.use(GenericErrorMiddleware);

	bot.command('start', (ctx) => ctx.reply('É nóis'));
	bot.on('message', userMiddleware, replyMiddleware);

	bot.command(PingCommand.command, PingCommand);
	bot.command(WhatsCommand.command, WhatsCommand);
	bot.command(CafeCommand.command, CafeCommand);
	bot.command(CafeInvCommand.command, CafeInvCommand);

	bot.use(apiKeyConfirmationMenu);
	bot.command('cadastrar', createSignupCommand(execute));
	bot.command(
		'gerar_chave',
		userMiddleware,
		createGenerateApiKeyCommand(execute, apiKeyConfirmationMenu),
	);
	bot.command('listar_pets', userMiddleware, createListPetsCommand(execute));
	bot.use(createPetModule(userMiddleware));
	bot.use(createPetFoodModule(userMiddleware));

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
			console.error('Could not report Telegram update error', reportingError);
		}),
	);

	return {
		bot,
		setWebhook: (url) => bot.api.setWebhook(url),
		setCommands: async () => {
			const commands = [
				{
					command: getCommandForHelp(PingCommand),
					description: getDescriptionForHelp(PingCommand),
				},
				{
					command: getCommandForHelp(WhatsCommand),
					description: getDescriptionForHelp(WhatsCommand),
				},
				{
					command: getCommandForHelp(CafeCommand),
					description: getDescriptionForHelp(CafeCommand),
				},
				{
					command: getCommandForHelp(CafeInvCommand),
					description: getDescriptionForHelp(CafeInvCommand),
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
