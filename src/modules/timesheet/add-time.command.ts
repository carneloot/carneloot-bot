import { MiddlewareFn } from 'grammy';
import axios from 'axios';

import type { AnimationResponse } from '../../common/response/response';
import { mockResponse } from '../../common/utils/mock-response';
import { sendRandomResponse } from '../../common/response/send-random-response';
import { random } from '../../common/utils/random';

const { GOOGLE_SPREADSHEET_URL, DEBUG } = process.env

const responses: AnimationResponse[] = [
    'https://media0.giphy.com/media/111ebonMs90YLu/giphy.gif?cid=ecf05e4742ggg8wjei96725mcg2zdx96asxga53fro0dt4j3&rid=giphy.gif&ct=g',
    'https://media2.giphy.com/media/62PP2yEIAZF6g/giphy.gif?cid=ecf05e477jl1iys6oacue7yzs0l2t44dxzlqp9b8mwzvbrt9&rid=giphy.gif&ct=g',
    'https://media0.giphy.com/media/jL6OeIhk3zPi/giphy.gif?cid=ecf05e477jl1iys6oacue7yzs0l2t44dxzlqp9b8mwzvbrt9&rid=giphy.gif&ct=g',
    'https://media3.giphy.com/media/AviNPoJQugg4ege4A1/giphy.gif?cid=ecf05e47k9q1z2uk40wdmzkkujhjcuyar4prrfnxl9zazhr9&rid=giphy.gif&ct=g',
].map(input => ({ type: 'animation', input }));

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

    await sendRandomResponse(ctx, responses);
};
