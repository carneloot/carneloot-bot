import { Bot } from 'grammy';

import { Module } from './common/module/module';

import { GenericErrorMiddleware } from './middlewares/generic-error.middleware';
import { DelayMiddleware } from './middlewares/delay.middleware';

import { PingCommand } from './commands/ping.command';
import { WhatsCommand } from './commands/whatsCommand';

import { TimesheetModule } from './modules/timesheet';

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

    bot.use(TimesheetModule);

    bot
        .on(':text')
        .use(DelayMiddleware(1000), ctx => ctx.reply(ctx.msg.text));

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
