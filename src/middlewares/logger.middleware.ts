import { MiddlewareFn } from 'grammy';

export const LoggerMiddleware =
	(userIds: number[]): MiddlewareFn =>
	async (ctx, next) => {
		const message = `[LOGGER] User "${ctx.from?.username}" ran command "${ctx.message?.text}"`;

		// Ignore user sending the command
		userIds = userIds.filter((userId) => ctx.from?.id !== userId);

		await Promise.all(userIds.map((userId) => ctx.api.sendMessage(userId, message)));

		await next();
	};
