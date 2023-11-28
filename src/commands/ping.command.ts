import ms from 'ms';

import type { Command } from '../common/types/command';
import { sleep } from '../common/utils/sleep';

const MAX_DURATION = ms('10s');

export const PingCommand: Command<'ping'> = {
	command: 'ping',
	description: 'Ponga de volta',
	middleware: () => async (ctx) => {
		const duration = ctx.match ? ms(ctx.match?.toString()) : null

		if (duration && duration <= MAX_DURATION) {
			await sleep(duration);
		}

		await ctx.reply('pong', {
			reply_to_message_id: ctx.msg?.message_id
		});
	}
};
