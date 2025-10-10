import { conversations } from '@grammyjs/conversations';
import { emojiParser } from '@grammyjs/emoji';
import { RedisAdapter } from '@grammyjs/storage-redis';

import { Redacted } from 'effect';
import { Bot } from 'grammy';
import { CafeCommand } from './commands/cafe-command.js';
import { PingCommand } from './commands/ping.command.js';
import { WhatsCommand } from './commands/whats-command.js';
import { Env } from './common/env.js';
import { Module } from './common/module/module.js';
import {
	getCommandForHelp,
	getDescriptionForHelp
} from './common/types/command.js';
import type { Context } from './common/types/context.js';
import { redis } from './lib/redis/redis.js';
import { GenericErrorMiddleware } from './middlewares/generic-error.middleware.js';
import { replyMiddleware } from './middlewares/reply.middleware.js';
import { UserMiddleware } from './middlewares/user.middleware.js';
import { AuthModule } from './modules/auth/auth-module.js';
import { PetModule } from './modules/pet/pet.module.js';
import { PetFoodModule } from './modules/pet-food/pet-food.module.js';

export const createBot = () => {
	const bot = new Bot<Context>(Env.BOT_TOKEN.pipe(Redacted.value));
	const myEmojiParser = emojiParser();

	bot.use(
		conversations({
			storage: new RedisAdapter({
				instance: redis.duplicate({ keyPrefix: 'session:' })
			}),
			plugins: [myEmojiParser]
		})
	);

	bot.command('cancelar', async (ctx) => {
		await ctx.reply('Operação cancelada', {
			reply_markup: { remove_keyboard: true }
		});
	});

	bot.use(myEmojiParser);

	bot.use(GenericErrorMiddleware);

	bot.command('start', (ctx) => ctx.reply('É nóis'));
	bot.on('message', UserMiddleware, replyMiddleware);

	bot.command(PingCommand.command, PingCommand);
	bot.command(WhatsCommand.command, WhatsCommand);
	bot.command(CafeCommand.command, CafeCommand);

	bot.use(AuthModule);
	bot.use(PetModule);
	bot.use(PetFoodModule);

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
			const commands = [
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
			];

			await bot.api.setMyCommands(commands, { language_code: 'br' });
		}
	};
};
