import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Config, Effect, FileSystem, Layer } from 'effect';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DatabaseBackup, R2BackupStoreLive } from '../lib/database/backup.js';
import { syncDatabaseSchema } from '../lib/database/sync-schema.js';

Effect.gen(function* () {
	const backupsEnabled = yield* Config.Boolean('DATABASE_BACKUP_ENABLED').pipe(
		Config.withDefault(false),
	);
	if (backupsEnabled) {
		const databaseUrl = yield* Config.String('DATABASE_URL');
		const source = yield* Effect.try(() => fileURLToPath(databaseUrl));
		const fs = yield* FileSystem.FileSystem;
		// A missing mount must not be mistaken for a first deployment.
		yield* fs.stat(dirname(source));
		if (yield* fs.exists(source)) {
			yield* DatabaseBackup.use((backup) => backup.run('pre-deploy')).pipe(
				Effect.provide(
					DatabaseBackup.layer.pipe(Layer.provide(R2BackupStoreLive)),
				),
			);
		} else {
			yield* Effect.logInfo('No database exists yet; skipping initial backup');
		}
	}

	yield* Effect.scoped(syncDatabaseSchema());
	yield* Effect.logInfo('Database preparation completed');
}).pipe(Effect.provide(BunFileSystem.layer), BunRuntime.runMain);
