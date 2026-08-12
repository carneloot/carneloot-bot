import type { MiddlewareFn } from 'grammy';

import type { Context } from '../common/types/context.js';

type ForwardToOwnerConfig = {
	ownerChatId: number;
	usernames: ReadonlyArray<string>;
};

export const createForwardToOwnerMiddleware = ({
	ownerChatId,
	usernames,
}: ForwardToOwnerConfig): MiddlewareFn<Context> => {
	const allowedUsernames = new Set(usernames);

	return async (ctx, next) => {
		const username = ctx.from?.username;
		const isCommand = ctx.message?.entities?.some(
			(entity) => entity.type === 'bot_command',
		);

		if (
			username &&
			allowedUsernames.has(username.toLowerCase()) &&
			!isCommand
		) {
			await ctx.api.sendMessage(ownerChatId, `@${username}`);
			await ctx.forwardMessage(ownerChatId);
		}

		await next();
	};
};
