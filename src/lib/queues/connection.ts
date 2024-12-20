import type { ConnectionOptions } from 'bullmq';

import { Env } from '../../common/env.js';

export const connection = {
	url: Env.REDIS_URL
} satisfies ConnectionOptions;
