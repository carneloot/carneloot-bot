import { MiddlewareFn } from 'grammy';
import axios from 'axios';

const { GOOGLE_SPREADSHEET_URL } = process.env;

export const AddTimeCommand: MiddlewareFn = async ctx => {
    if (!GOOGLE_SPREADSHEET_URL) {
        return await ctx.reply('An error occurred trying to add time.');
    }

    const statusMessage = await ctx.reply('Processing...');

    const res = await axios.post<string>(GOOGLE_SPREADSHEET_URL, {});

    const responseMessage = res.data;

    await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        responseMessage
    );
};
