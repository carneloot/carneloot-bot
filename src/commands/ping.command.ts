import { MiddlewareFn } from 'grammy';

import type { Command } from '../types/command';

export const PingCommand: MiddlewareFn & Partial<Command<'ping'>> = async ctx => {
    await ctx.reply('pong', {
        reply_to_message_id: ctx.msg?.message_id
    });
}

PingCommand.command = 'ping';
PingCommand.description = 'Ponga de volta';
