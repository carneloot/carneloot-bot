import { Api, type Bot, type Context } from 'grammy';
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
	const client = {
		...bot.api.options,
		fetch: async (url: string | URL | Request, init?: RequestInit) =>
			new Response(
				JSON.stringify(
					respond(
						String(url).slice(String(url).lastIndexOf('/') + 1),
						JSON.parse(init?.body as string) as object,
					),
				),
			),
	};
	// Mock the transport, preserving transformers for the bot and cloned clients.
	const api = new Api(bot.token, client);
	api.config.use(...bot.api.config.installedTransformers());
	Object.defineProperty(bot, 'api', { value: api });
	Object.defineProperty(bot, 'clientConfig', { value: client });

	return { calls, dispatch: (update: Update) => bot.handleUpdate(update) };
};
