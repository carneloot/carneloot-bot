import { MiddlewareFn } from 'grammy';
import axios from 'axios';

import { mockResponse } from '../../common/utils/mock-response';
import { random } from '../../common/utils/random';

const { GOOGLE_SPREADSHEET_URL, DEBUG } = process.env

const getResponse = () => !!DEBUG
    ? mockResponse('Preenchido debug!', random(500, 1500))
    : axios.post<string>(GOOGLE_SPREADSHEET_URL!, {});

export const AddTimeCommand: MiddlewareFn = async ctx => {
    if (!GOOGLE_SPREADSHEET_URL) {
        throw new Error('Missing spreadsheet url')
    }

    const statusMessage = await ctx.reply('Processando...');

    const res = await getResponse();

    const responseMessage = res.data;

    await ctx.api.editMessageText(
        statusMessage.chat.id,
        statusMessage.message_id,
        responseMessage,
    );
};
