import { Context } from 'grammy';

import { UserResponse } from './response.js';
import { flattenMaybeFunction } from '../types/maybe-function.js';

export const sendResponse = async (ctx: Context, response: UserResponse) => {
	if (response.type === 'gif') {
		return await ctx.replyWithAnimation(flattenMaybeFunction(response.input), {
			caption: flattenMaybeFunction(response.caption)
		});
	}

	if (response.type === 'image') {
		return await ctx.replyWithPhoto(flattenMaybeFunction(response.input, ctx, 'oi'), {
			caption: flattenMaybeFunction(response.caption)
		});
	}

	if (response.type === 'text') {
		return await ctx.reply(flattenMaybeFunction(response.text));
	}
};
