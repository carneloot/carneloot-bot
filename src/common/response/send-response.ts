import { Context } from 'grammy';

import { UserResponse } from './response';
import { flattenMaybeFunction } from '../types/maybe-function';

export const sendResponse = async (ctx: Context, response: UserResponse) => {
    if (response.type === 'animation') {
        return await ctx.replyWithAnimation(
            flattenMaybeFunction(response.input),
            {
                caption: flattenMaybeFunction(response.caption)
            },
        );
    }

    if (response.type === 'image') {
        return await ctx.replyWithPhoto(
            flattenMaybeFunction(response.input, ctx, 'oi'),
            {
                caption: flattenMaybeFunction(response.caption),
            },
        );
    }

    if (response.type === 'text') {
        return await ctx.reply(flattenMaybeFunction(response.text));
    }
}
