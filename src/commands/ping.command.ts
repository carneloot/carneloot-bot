import type { Command } from '../common/types/command';

export const PingCommand: Command<'ping'> = {
    command: 'ping',
    description: 'Ponga de volta',
    middleware: () => async ctx => {
        await ctx.reply('pong', {
            reply_to_message_id: ctx.msg?.message_id
        });
    },
}
