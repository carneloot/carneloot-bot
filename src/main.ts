import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';

import { HttpLive } from './adapters/http/server.js';
import { TelegramPollingLive } from './adapters/telegram/polling.js';
import { runtime } from './app/layer.js';
import { makeReadinessCheck } from './app/readiness.js';
import { Env } from './common/env.js';
import {
	DatabaseBackup,
	DatabaseBackupDailyLive,
	R2BackupStoreLive,
} from './lib/database/backup.js';
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
		const petFoodService = yield* PetFoodService;
		const checkReadiness = yield* makeReadinessCheck;
		yield* checkReadiness.pipe(
			Effect.withSpan('application.readiness', {
				attributes: { 'application.run.mode': Env.RUN_MODE },
			}),
		);
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
