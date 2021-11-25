import { Context, NextFunction } from 'grammy';
import { AnimationResponse, sendResponse } from '../utils/send-response';

const AUTH_COMMANDS = ['/add'];
const AUTHORIZED_USERS = process.env.AUTHORIZED_USERS?.split(',') ?? [];

const unauthorizedResponse: AnimationResponse = {
    type: 'animation',
    input: 'https://media4.giphy.com/media/tB8Wl0JABkSkQa7vGE/giphy.gif?cid=790b761186da0c0e34d631f9cfb91a6da34100ab0656eecf&rid=giphy.gif&ct=g',
    caption: 'Calma lá parcero (a)!\nVocê não pode fazer isso.',
}

export const AuthMiddleware = async (ctx: Context, next: NextFunction) => {
    const isAuthCommand = AUTH_COMMANDS.some(command => ctx.message?.text?.startsWith(command));

    if (!isAuthCommand) {
        return await next();
    }

    const isAuthorizedUser = AUTHORIZED_USERS.some(user => ctx.message?.from?.username === user);

    if (isAuthorizedUser) {
        return await next();
    }

    await sendResponse(ctx, unauthorizedResponse);
}
