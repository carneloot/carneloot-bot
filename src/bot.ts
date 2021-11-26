import { Bot } from 'grammy';

import { AddTimeCommand } from './commands/add-time.command';
import { PingCommand } from './commands/ping.command';

import { AuthMiddleware } from './middlewares/auth.middleware';
import { GenericErrorMiddleware } from './middlewares/generic-error.middleware';

const { BOT_TOKEN } = process.env;

export const createBot = () => {
    if (!BOT_TOKEN) {
        throw new Error('Missing BOT_TOKEN');
    }

    const bot = new Bot(BOT_TOKEN);

    bot.use(GenericErrorMiddleware);

    bot.use(AuthMiddleware);

    bot.command('start', ctx => ctx.reply('É nóis'));

    bot
        .on(':text')
        .hears(/hello/i, ctx => ctx.replyWithPhoto('https://i.kym-cdn.com/photos/images/original/001/475/422/473.jpg'));

    bot.command(PingCommand.command!, PingCommand);

    bot.command(AddTimeCommand.command!, AddTimeCommand);

    return bot;
}

export const setWebhook = (bot: Bot, url: string) => bot.api.setWebhook(url)

export const onStart = async (bot: Bot) => {
    await bot.api.setMyCommands([
        { command: PingCommand.command!, description: PingCommand.description ?? '' },
        { command: AddTimeCommand.command!, description: AddTimeCommand.description ?? '' },
    ]);
}
