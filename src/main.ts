import { Effect, FiberSet } from 'effect';

import { startHttpServer } from './adapters/http/server.js';
import { PetFoodNotificationQueue } from './adapters/queue/pet-food-notification.js';
import { createBot } from './adapters/telegram/bot.js';
import { ConversationPersistence } from './adapters/telegram/conversation-storage.js';
import { startPolling } from './adapters/telegram/polling.js';
import { type AppServices, runtime } from './app/layer.js';
import { Env } from './common/env.js';
import { Database } from './lib/database/db.js';
import { syncDatabaseSchema } from './lib/database/sync-schema.js';

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
		yield* syncDatabaseSchema();

		const execute = yield* FiberSet.makeRuntimePromise<AppServices>();
		const conversationPersistence = yield* ConversationPersistence;
		const telegramBot = createBot(execute, conversationPersistence.storage);
		const database = yield* Database;
		const notificationQueue = yield* PetFoodNotificationQueue;
		const readiness = Effect.all([
			database.checkHealth(),
			conversationPersistence.checkHealth,
			notificationQueue.checkHealth,
			Effect.tryPromise(() => telegramBot.checkHealth()),
		]).pipe(
			Effect.asVoid,
			Effect.withSpan('application.readiness', {
				attributes: { 'application.run.mode': Env.RUN_MODE },
			}),
		);

		yield* startHttpServer(telegramBot, execute, readiness);

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
