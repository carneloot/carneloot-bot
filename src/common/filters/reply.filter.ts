import { MiddlewareFn } from 'grammy';

export const ReplyFilter: MiddlewareFn = (ctx, next) => {
	if (ctx.message?.reply_to_message) {
		return next()
	}
}
