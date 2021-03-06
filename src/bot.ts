import { Bot } from 'grammy';

import { Module } from './common/module/module';

import { GenericErrorMiddleware } from './middlewares/generic-error.middleware';

import { PingCommand } from './commands/ping.command';
import { WhatsCommand } from './commands/whatsCommand';

const { BOT_TOKEN } = process.env;

export const createBot = () => {
    if (!BOT_TOKEN) {
        throw new Error('Missing BOT_TOKEN');
    }

    const bot = new Bot(BOT_TOKEN);

    bot.use(GenericErrorMiddleware);

    bot.command('start', ctx => ctx.reply('É nóis'));

    bot.command(PingCommand.command!, PingCommand);
    bot.command(WhatsCommand.command!, WhatsCommand);

    bot
        .on(':text')
        .hears(/hello/i, ctx => ctx.replyWithPhoto('https://i.kym-cdn.com/photos/images/original/001/475/422/473.jpg'));

    return bot;
}

export const setWebhook = (bot: Bot, url: string) => bot.api.setWebhook(url)

export const onStart = async (bot: Bot) => {
    await bot.api.setMyCommands([
        { command: PingCommand.command!, description: PingCommand.description ?? '' },
        { command: WhatsCommand.command!, description: WhatsCommand.description ?? '' },
        ...Module.getCommandList(),
    ]);
}
