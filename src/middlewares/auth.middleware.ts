import { Composer, Context } from 'grammy';

import { sendResponse } from '../common/response/send-response';
import type { AnimationResponse } from '../common/response/response';

const AUTH_COMMANDS = ['/add'];
const AUTHORIZED_USERS = process.env.AUTHORIZED_USERS?.split(',') ?? [];

const unauthorizedResponse: AnimationResponse = {
    type: 'animation',
    input: 'https://media4.giphy.com/media/tB8Wl0JABkSkQa7vGE/giphy.gif?cid=790b761186da0c0e34d631f9cfb91a6da34100ab0656eecf&rid=giphy.gif&ct=g',
    caption: 'Calma lá parcero (a)!\nVocê não pode fazer isso.',
}

export const AuthMiddleware = new Composer();

const isAuthCommand = (ctx: Context) => AUTH_COMMANDS.some(command => ctx.message?.text?.startsWith(command));
const isUserNotAuthorized = (ctx: Context) => !AUTHORIZED_USERS.some(user => ctx.message?.from?.username === user);

AuthMiddleware
    .filter(isAuthCommand)
    .filter(isUserNotAuthorized)
    .use(ctx => sendResponse(ctx, unauthorizedResponse));
