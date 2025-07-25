import type { MiddlewareFn } from 'grammy';

import { sleep } from '../common/utils/sleep.js';

export const DelayMiddleware =
	(ms: number): MiddlewareFn =>
	async (_ctx, next) => {
		await sleep(ms);

		await next();
	};
