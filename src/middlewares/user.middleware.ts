import { MiddlewareFn } from 'grammy';
import { Context } from '../common/types/context';
import { getUserByTelegramID } from '../lib/user';

export const UserMiddleware = (async (ctx, next) => {
	const user = await getUserByTelegramID(ctx.from!.id);

	if (user) {
		ctx.user = user;
	}

	await next();
}) satisfies MiddlewareFn<Context>;
