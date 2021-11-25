import { AnimationResponse, sendResponse } from '../utils/send-response';
import { Context, NextFunction } from 'grammy';

const errorResponse: AnimationResponse = {
    type: 'animation',
    input: 'https://media0.giphy.com/media/ISOckXUybVfQ4/giphy.gif?cid=ecf05e4774yf5i9y4p54l43l2nod8w7tc3b794h07zkfd1va&rid=giphy.gif&ct=g',
    caption: 'Aconteceu um erro nesse comando 😢',
}

export const GenericErrorMiddleware = async (ctx: Context, next: NextFunction) => {
    try {
        await next();
    } catch (err) {
        await sendResponse(ctx, errorResponse);
    }
}
