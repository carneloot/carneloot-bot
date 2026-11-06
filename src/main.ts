import { Effect, FiberSet } from 'effect';

import { startHttpServer } from './adapters/http/server.js';
import { createBot } from './adapters/telegram/bot.js';
import { startPolling } from './adapters/telegram/polling.js';
import { type AppServices, runtime } from './app/layer.js';
import { Env } from './common/env.js';
import { syncDatabaseSchema } from './lib/database/sync-schema.js';
import { PetFoodNotificationQueue } from './lib/queues/pet-food-notification.js';

const waitForShutdown = Effect.callback<void>((resume) => {
	const stop = () => resume(Effect.void);

	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);

	return Effect.sync(() => {
		process.off('SIGINT', stop);
		process.off('SIGTERM', stop);
	});
});

const app = Effect.scoped(
	Effect.gen(function* () {
		yield* Effect.tryPromise(() => syncDatabaseSchema());

		const execute = yield* FiberSet.makeRuntimePromise<AppServices>();
		const telegramBot = createBot(execute);

		yield* PetFoodNotificationQueue;
		yield* startHttpServer(telegramBot, execute);

		if (Env.RUN_MODE === 'polling') {
			yield* startPolling(telegramBot);
		}

		yield* waitForShutdown;
	}),
);

const program = Effect.promise(() => runtime.runPromise(app)).pipe(
	Effect.ensuring(runtime.disposeEffect),
);

void Effect.runPromise(program);
