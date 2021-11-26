import { Context } from 'grammy';

import { UserResponse } from './response';

export const sendResponse = async (ctx: Context, response: UserResponse) => {
    if (response.type === 'animation') {
        return await ctx.replyWithAnimation(response.input, { caption: response.caption });
    }

    if (response.type === 'image') {
        return await ctx.replyWithPhoto(response.input, { caption: response.caption });
    }

    if (response.type === 'text') {
        return await ctx.reply(response.text);
    }
}
