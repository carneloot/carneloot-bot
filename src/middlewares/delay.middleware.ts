import { MiddlewareFn } from 'grammy';

import { sleep } from '../common/utils/sleep';

export const DelayMiddleware =
	(ms: number): MiddlewareFn =>
	async (ctx, next) => {
		await sleep(ms);

		await next();
	};
