import { MiddlewareFn } from 'grammy';
import { Context } from '../common/types/context.js';
import { getUserByTelegramID } from '../lib/entities/user.js';

export const UserMiddleware = (async (ctx, next) => {
	const user = await getUserByTelegramID(ctx.from!.id);

	if (user) {
		ctx.user = user;
	}

	await next();
}) satisfies MiddlewareFn<Context>;
