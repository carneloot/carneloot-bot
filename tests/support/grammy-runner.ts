import type { Bot, Context } from 'grammy';
import type { Update } from 'grammy/types';

export type GrammyApiCall = {
	readonly method: string;
	readonly payload: object;
};

export const createGrammyRunner = <TContext extends Context>(
	bot: Bot<TContext>,
) => {
	const calls: GrammyApiCall[] = [];
	bot.api.config.use(async (_prev, method, payload) => {
		calls.push({ method, payload });
		return {
			ok: true,
			result:
				method === 'sendMessage'
					? {
							message_id: calls.length,
							date: 0,
							chat: { id: 1, type: 'private' },
						}
					: true,
		} as never;
	});

	return { calls, dispatch: (update: Update) => bot.handleUpdate(update) };
};
