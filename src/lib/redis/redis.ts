import { Redis } from 'ioredis';

import { Env } from '../../common/env.js';

const redisUrl = new URL(Env.REDIS_URL);

export const redis = new Redis({
	host: redisUrl.hostname,
	port: Number.parseInt(redisUrl.port),
	username: redisUrl.username,
	password: redisUrl.password,
	maxRetriesPerRequest: null
});
