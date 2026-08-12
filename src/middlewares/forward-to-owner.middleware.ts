import type { MiddlewareFn } from 'grammy';

import type { Context } from '../common/types/context.js';

type ForwardToOwnerConfig = {
	ownerChatId: number;
	usernames: string;
};

const normalizeUsername = (username: string) =>
	username.trim().replace(/^@/, '').toLowerCase();

export const createForwardToOwnerMiddleware = ({
	ownerChatId,
	usernames,
}: ForwardToOwnerConfig): MiddlewareFn<Context> => {
	const allowedUsernames = new Set(
		usernames.split(',').map(normalizeUsername).filter(Boolean),
	);

	return async (ctx, next) => {
		const username = ctx.from?.username;
		const isCommand = ctx.message?.entities?.some(
			(entity) => entity.type === 'bot_command',
		);

		if (
			username &&
			allowedUsernames.has(normalizeUsername(username)) &&
			!isCommand
		) {
			await ctx.forwardMessage(ownerChatId);
		}

		await next();
	};
};
