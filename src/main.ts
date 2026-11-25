import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import { HttpLive } from './adapters/http/server.js';
import { PetFoodNotificationQueue } from './adapters/queue/pet-food-notification.js';
import { TelegramBot } from './adapters/telegram/bot.js';
import { ConversationPersistence } from './adapters/telegram/conversation-storage.js';
import { TelegramPollingLive } from './adapters/telegram/polling.js';
import { runtime } from './app/layer.js';
import { Env } from './common/env.js';
import {
	DatabaseBackup,
	DatabaseBackupDailyLive,
	R2BackupStoreLive,
} from './lib/database/backup.js';
import { Database } from './lib/database/db.js';
import { PetFoodService } from './lib/services/pet-food.js';

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
		const conversationPersistence = yield* ConversationPersistence;
		const telegramBot = yield* TelegramBot;
		const database = yield* Database;
		const notificationQueue = yield* PetFoodNotificationQueue;
		const petFoodService = yield* PetFoodService;
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
		yield* readiness;
		yield* petFoodService.reconcileNotifications();

		if (Env.DATABASE_BACKUP_ENABLED === 'true') {
			yield* Layer.build(
				DatabaseBackupDailyLive.pipe(
					Layer.provide(DatabaseBackup.layer),
					Layer.provide(R2BackupStoreLive),
					Layer.provide(BunFileSystem.layer),
				),
			);
		}

		yield* Layer.build(
			HttpRouter.serve(HttpLive).pipe(
				Layer.provide(BunHttpServer.layer({ port: Env.PORT })),
			),
		);

		if (Env.RUN_MODE === 'polling') {
			yield* Layer.build(TelegramPollingLive);
		}

		yield* waitForShutdown;
	}),
);

const program = Effect.promise(() => runtime.runPromise(app)).pipe(
	Effect.ensuring(runtime.disposeEffect),
);

void Effect.runPromise(program);
