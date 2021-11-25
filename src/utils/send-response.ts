import { Context } from 'grammy';

export type AnimationResponse = {
    type: 'animation',
    input: string,
    caption?: string;
};

export type ImageResponse = {
    type: 'image',
    input: string,
    caption?: string;
}

export type TextResponse = {
    type: 'text',
    text: string,
}

export type UserResponse = AnimationResponse
    | ImageResponse
    | TextResponse;

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
