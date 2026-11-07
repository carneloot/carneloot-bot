import { Context, Effect, Layer } from 'effect';
import { Redis as IORedis } from 'ioredis';

import { Env } from '../../common/env.js';

const redisUrl = new URL(Env.REDIS_URL);

type RedisClient = {
	readonly client: IORedis;
};

export const Redis = Context.Service<RedisClient>('app/Redis');

export type Redis = typeof Redis.Identifier;

export const RedisLive = Layer.effect(
	Redis,
	Effect.gen(function* () {
		const client = yield* Effect.acquireRelease(
			Effect.sync(
				() =>
					new IORedis({
						host: redisUrl.hostname,
						port: Number.parseInt(redisUrl.port, 10),
						username: redisUrl.username || undefined,
						password: redisUrl.password || undefined,
						maxRetriesPerRequest: null,
					}),
			),
			(client) => Effect.promise(() => client.quit()),
		);

		return Redis.of({ client });
	}),
);
