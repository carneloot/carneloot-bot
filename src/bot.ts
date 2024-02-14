import { Bot } from 'grammy';

import { Module } from './common/module/module';

import { GenericErrorMiddleware } from './middlewares/generic-error.middleware';

import { AuthModule } from './modules/auth/auth-module';
import { NotificationModule } from './modules/notification/notification.module';

import { PingCommand } from './commands/ping.command';
import { WhatsCommand } from './commands/whats-command';
import { CafeCommand } from './commands/cafe-command';
import { getCommandForHelp, getDescriptionForHelp } from './common/types/command';
import { Context } from './common/types/context';
import { emojiParser } from '@grammyjs/emoji';

const { BOT_TOKEN } = process.env;

export const createBot = () => {
	if (!BOT_TOKEN) {
		throw new Error('Missing BOT_TOKEN');
	}

	const bot = new Bot<Context>(BOT_TOKEN);

	bot.use(emojiParser());

	bot.use(GenericErrorMiddleware);

	bot.command('start', (ctx) => ctx.reply('É nóis'));

	bot.command(PingCommand.command!, PingCommand);
	bot.command(WhatsCommand.command!, WhatsCommand);
	bot.command(CafeCommand.command!, CafeCommand);

	bot.use(AuthModule);
	bot.use(NotificationModule);

	bot.on(':text').hears(/hello/i, (ctx) =>
		ctx.replyWithPhoto('https://i.kym-cdn.com/photos/images/original/001/475/422/473.jpg')
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
				...Module.getCommandList()
			]);
		}
	};
};
