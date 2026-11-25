import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Effect, Layer } from 'effect';

import { DatabaseBackup, R2BackupStoreLive } from '../lib/database/backup.js';

const services = DatabaseBackup.layer.pipe(
	Layer.provide(R2BackupStoreLive),
	Layer.provide(BunFileSystem.layer),
);

DatabaseBackup.use((backup) => backup.run()).pipe(
	Effect.provide(services),
	BunRuntime.runMain,
);
