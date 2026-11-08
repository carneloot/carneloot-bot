import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Execute } from '../adapters/execute.js';
import { Env } from '../common/env.js';
import type { GifResponse } from '../common/response/response.js';
import { sendResponse } from '../common/response/send-response.js';
import type { Context } from '../common/types/context.js';

const errorResponse: GifResponse = {
	type: 'gif',
	input:
		'https://media0.giphy.com/media/ISOckXUybVfQ4/giphy.gif?cid=ecf05e4774yf5i9y4p54l43l2nod8w7tc3b794h07zkfd1va&rid=giphy.gif&ct=g',
	caption: 'Aconteceu um erro nesse comando 😢',
};

export const createGenericErrorMiddleware =
	(execute: Execute<never>): MiddlewareFn<Context> =>
	async (ctx, next) => {
		try {
			await next();
		} catch (error) {
			if (Env.DEBUG) {
				void execute(Effect.logError('Telegram command failed', error)).catch(
					() => undefined,
				);
			}
			await sendResponse(ctx, errorResponse);
		}
	};
