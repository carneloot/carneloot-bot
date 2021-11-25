import { MiddlewareFn } from 'grammy';
import axios from 'axios';

import { AnimationResponse, sendResponse } from '../utils/send-response';

const { GOOGLE_SPREADSHEET_URL } = process.env

const successResponse: AnimationResponse = {
    type: 'animation',
    input: 'https://media0.giphy.com/media/111ebonMs90YLu/giphy.gif?cid=ecf05e4742ggg8wjei96725mcg2zdx96asxga53fro0dt4j3&rid=giphy.gif&ct=g',
    caption: 'Naisu!',
}

export const AddTimeCommand: MiddlewareFn = async ctx => {
    if (!GOOGLE_SPREADSHEET_URL) {
        return await ctx.reply('An error occurred trying to add time.');
    }

    const statusMessage = await ctx.reply('Processando...');

    const res = await axios.post<string>(GOOGLE_SPREADSHEET_URL, {});

    const responseMessage = res.data;

    await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        responseMessage,
    );

    await sendResponse(ctx, successResponse);
};
