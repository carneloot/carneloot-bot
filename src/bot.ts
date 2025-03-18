import { conversations } from '@grammyjs/conversations';
import { emojiParser } from '@grammyjs/emoji';
import { RedisAdapter } from '@grammyjs/storage-redis';

import { Bot, session } from 'grammy';
import { Redis } from 'ioredis';

import { Env } from './common/env.js';
import { Module } from './common/module/module.js';
import {
	getCommandForHelp,
	getDescriptionForHelp
} from './common/types/command.js';
import type { Context } from './common/types/context.js';

import { GenericErrorMiddleware } from './middlewares/generic-error.middleware.js';

import { AuthModule } from './modules/auth/auth-module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { PetFoodModule } from './modules/pet-food/pet-food.module.js';
import { PetModule } from './modules/pet/pet.module.js';

import { CafeCommand } from './commands/cafe-command.js';
import { PingCommand } from './commands/ping.command.js';
import { WhatsCommand } from './commands/whats-command.js';
import { connection } from './lib/queues/connection.js';

export const createBot = () => {
	const bot = new Bot<Context>(Env.BOT_TOKEN);
	const redis = new Redis({ ...connection, keyPrefix: 'session:' });

	bot.use(
		session({
			type: 'multi',
			conversation: {
				storage: new RedisAdapter({ instance: redis })
			}
		})
	);

	bot.use(conversations());

	bot.command('cancelar', async (ctx) => {
		await ctx.conversation.exit();

		await ctx.reply('Operação cancelada', {
			reply_markup: { remove_keyboard: true }
		});
	});

	bot.use(emojiParser());

	bot.use(GenericErrorMiddleware);

	bot.command('start', (ctx) => ctx.reply('É nóis'));

	bot.command(PingCommand.command, PingCommand);
	bot.command(WhatsCommand.command, WhatsCommand);
	bot.command(CafeCommand.command, CafeCommand);

	bot.use(AuthModule);
	bot.use(PetModule);
	bot.use(PetFoodModule);
	bot.use(NotificationModule);

	bot
		.on(':text')
		.hears(/hello/i, (ctx) =>
			ctx.replyWithPhoto(
				'https://i.kym-cdn.com/photos/images/original/001/475/422/473.jpg'
			)
		);

	return {
		bot,
		setWebhook: (url: string) => bot.api.setWebhook(url),
		setCommands: async () => {
			await bot.api.setMyCommands([
				{
					command: getCommandForHelp(PingCommand),
					description: getDescriptionForHelp(PingCommand)
				},
				{
					command: getCommandForHelp(WhatsCommand),
					description: getDescriptionForHelp(WhatsCommand)
				},
				{
					command: getCommandForHelp(CafeCommand),
					description: getDescriptionForHelp(CafeCommand)
				},
				{
					command: 'cancelar',
					description: 'Cancela a operação atual'
				},
				...Module.getCommandList()
			]);
		}
	};
};
