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
	const respond = (method: string, payload: object) => {
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
		};
	};
	bot.api.config.use(
		async (_prev, method, payload) => respond(method, payload) as never,
	);
	// Bot.handleUpdate and conversations create new clients, bypassing transformers.
	Object.defineProperty(bot, 'clientConfig', {
		value: {
			...bot.api.options,
			fetch: async (url: string, init: RequestInit) =>
				new Response(
					JSON.stringify(
						respond(
							url.slice(url.lastIndexOf('/') + 1),
							JSON.parse(init.body as string) as object,
						),
					),
				),
		},
	});

	return { calls, dispatch: (update: Update) => bot.handleUpdate(update) };
};
