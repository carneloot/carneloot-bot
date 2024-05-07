import type { MiddlewareFn } from 'grammy';
import type { Context } from '../common/types/context.js';
import { getUserByTelegramID } from '../lib/entities/user.js';

export const UserMiddleware = (async (ctx, next) => {
	const user = ctx.from?.id
		? await getUserByTelegramID(ctx.from.id)
		: undefined;

	if (user) {
		ctx.user = user;
	}

	await next();
}) satisfies MiddlewareFn<Context>;
