import { MiddlewareFn } from 'grammy';

export const PingCommand: MiddlewareFn = async ctx => {
    await ctx.reply('pong', {
        reply_to_message_id: ctx.msg?.message_id
    });
}
