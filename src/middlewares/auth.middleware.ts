import { Context, MiddlewareFn } from 'grammy';

import type { UserResponse } from '../common/response/response';
import type { Username } from '../common/types/username';
import { sendRandomResponse } from '../common/response/send-random-response';
import { publicAsset } from '../common/utils/public-asset';

const unauthorizedResponses: UserResponse[] = [
    {
        type: 'animation',
        input: 'https://media4.giphy.com/media/tB8Wl0JABkSkQa7vGE/giphy.gif?cid=790b761186da0c0e34d631f9cfb91a6da34100ab0656eecf&rid=giphy.gif&ct=g',
        caption: 'Calma lá parcero (a)!\nVocê não pode fazer isso.',
    },
    {
        type: 'animation',
        input: 'https://media1.giphy.com/media/26gsbJPV5xQruSkCI/giphy.gif?cid=ecf05e47eo5ftdi93d80yiucfe7i94anr6iv84c0kskux6r5&rid=giphy.gif&ct=g',
    },
    {
        type: 'animation',
        input: 'https://media1.giphy.com/media/l4FGBsnRdtf1HMQVi/giphy.gif?cid=ecf05e47a2u5uxnoipvw9u03exk3w7jva0gx0lqcyshxbv8l&rid=giphy.gif&ct=g',
    },
    {
        type: 'animation',
        input: 'https://media2.giphy.com/media/j6aoUHK5YiJEc/giphy.gif?cid=ecf05e47w7j35z8h4bbjox9xk419268q5b0vze1d8xq0bugx&rid=giphy.gif&ct=g',
    },
    {
        type: 'image',
        input: () => publicAsset('auth-1.jpg'),
        caption: () => (process.env.DEBUG && 'Foto aleatória porque é local') ?? undefined,
    },
];

const isUserAuthorized = (ctx: Context, authorizedUsers: Username[]) => authorizedUsers.some(user => ctx.message?.from?.username === user);

export const AuthMiddleware = (authorizedUsers: Username[]): MiddlewareFn => async (ctx, next) => {
    if (isUserAuthorized(ctx, authorizedUsers)) {
        await next();
        return;
    }

    await sendRandomResponse(ctx, unauthorizedResponses)
}
