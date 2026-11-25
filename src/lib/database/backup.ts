import { createClient } from '@libsql/client';
import {
	Clock,
	Config,
	Context,
	Cron,
	Data,
	Effect,
	FileSystem,
	Layer,
	Option,
	Redacted,
	Schedule,
	Stream,
} from 'effect';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class DatabaseBackupError extends Data.TaggedError(
	'DatabaseBackupError',
)<{
	operation: string;
	cause: unknown;
}> {}

export class BackupStore extends Context.Service<
	BackupStore,
	{
		upload: (
			key: string,
			path: string,
		) => Effect.Effect<void, DatabaseBackupError>;
		prune: (cutoff: number) => Effect.Effect<number, DatabaseBackupError>;
	}
>()('BackupStore') {}

export const R2BackupStoreLive = Layer.effect(
	BackupStore,
	Effect.gen(function* () {
		const config = yield* Config.all({
			bucket: Config.String('R2_BACKUP_BUCKET'),
			endpoint: Config.String('R2_BACKUP_ENDPOINT'),
			accessKeyId: Config.Redacted('R2_BACKUP_ACCESS_KEY_ID'),
			secretAccessKey: Config.Redacted('R2_BACKUP_SECRET_ACCESS_KEY'),
		});
		const { S3Client, file } = yield* Effect.promise(() => import('bun'));
		const client = new S3Client({
			bucket: config.bucket,
			endpoint: config.endpoint,
			region: 'auto',
			accessKeyId: Redacted.value(config.accessKeyId),
			secretAccessKey: Redacted.value(config.secretAccessKey),
		});

		return BackupStore.of({
			upload: Effect.fn('BackupStore.upload')((key, path) =>
				// Wait for the SDK to settle before scope cleanup removes the file.
				Effect.tryPromise({
					try: () =>
						client.write(key, file(path), { type: 'application/vnd.sqlite3' }),
					catch: (cause) =>
						new DatabaseBackupError({ operation: 'upload', cause }),
				}).pipe(Effect.asVoid, Effect.uninterruptible),
			),
			prune: Effect.fn('BackupStore.prune')(
				function* (cutoff) {
					const expired: string[] = [];
					const preDeploy: { key: string; modified: number }[] = [];
					yield* Stream.paginate(
						undefined,
						(continuationToken: string | undefined) =>
							Effect.tryPromise(() =>
								client.list({ prefix: 'sqlite/', continuationToken }),
							).pipe(
								Effect.map(
									(page) =>
										[
											page.contents ?? [],
											page.isTruncated
												? Option.fromNullishOr(page.nextContinuationToken)
												: Option.none(),
										] as const,
								),
							),
					).pipe(
						Stream.runForEach((object) =>
							Effect.sync(() => {
								const modified = Date.parse(object.lastModified ?? '');
								if (
									!object.key.endsWith('.sqlite') ||
									!Number.isFinite(modified)
								)
									return;
								if (
									object.key.startsWith('sqlite/daily/') &&
									modified <= cutoff
								) {
									expired.push(object.key);
								} else if (object.key.startsWith('sqlite/pre-deploy/')) {
									preDeploy.push({ key: object.key, modified });
								}
							}),
						),
					);
					// Rank across every page, keeping seven deployment snapshots regardless of age.
					preDeploy.sort(
						(a, b) => b.modified - a.modified || b.key.localeCompare(a.key),
					);
					expired.push(...preDeploy.slice(7).map((object) => object.key));
					yield* Effect.forEach(
						expired,
						(key) => Effect.tryPromise(() => client.delete(key)),
						{ discard: true },
					);
					return expired.length;
				},
				Effect.mapError(
					(cause) => new DatabaseBackupError({ operation: 'cleanup', cause }),
				),
			),
		});
	}),
);

export class DatabaseBackup extends Context.Service<
	DatabaseBackup,
	{
		run: (
			kind?: 'daily' | 'pre-deploy',
		) => Effect.Effect<string, DatabaseBackupError>;
	}
>()('DatabaseBackup') {
	static readonly layer = Layer.effect(
		DatabaseBackup,
		Effect.gen(function* () {
			const databaseUrl = yield* Config.String('DATABASE_URL');
			const fs = yield* FileSystem.FileSystem;
			const store = yield* BackupStore;

			return DatabaseBackup.of({
				run: Effect.fn('DatabaseBackup.run')(
					(kind: 'daily' | 'pre-deploy' = 'daily') =>
						Effect.scoped(
							Effect.gen(function* () {
								const source = yield* Effect.try(() =>
									fileURLToPath(databaseUrl),
								);
								// Do not let SQLite silently create an empty database on a typo.
								yield* fs.stat(source);
								const directory = yield* fs.makeTempDirectoryScoped({
									prefix: 'db-backup-',
								});
								const snapshot = join(directory, 'snapshot.sqlite');
								const client = yield* Effect.acquireRelease(
									Effect.try(() => createClient({ url: databaseUrl })),
									(client) => Effect.sync(() => client.close()),
								);
								// VACUUM INTO includes committed WAL pages in a consistent standalone file.
								yield* Effect.tryPromise(() =>
									client.execute('PRAGMA busy_timeout = 5000'),
								);
								yield* Effect.tryPromise(() =>
									client.execute({
										sql: 'VACUUM INTO ?',
										args: [snapshot],
									}),
								);
								const now = yield* Clock.currentTimeMillis;
								const key = `sqlite/${kind}/${new Date(now).toISOString().replaceAll(':', '-')}-${basename(directory)}.sqlite`;
								yield* store.upload(key, snapshot);
								yield* Effect.logInfo('Database backup uploaded').pipe(
									Effect.annotateLogs({ key }),
								);
								// Never remove recovery points until the new snapshot is uploaded.
								const deleted = yield* store.prune(
									now - 7 * 24 * 60 * 60 * 1000,
								);
								yield* Effect.logInfo('Database backup cleanup completed').pipe(
									Effect.annotateLogs({ deleted }),
								);
								return key;
							}),
						).pipe(
							Effect.mapError((cause) =>
								cause instanceof DatabaseBackupError
									? cause
									: new DatabaseBackupError({ operation: 'snapshot', cause }),
							),
						),
				),
			});
		}),
	);
}

export const DatabaseBackupDailyLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const backup = yield* DatabaseBackup;
		const expression = yield* Config.String('DATABASE_BACKUP_CRON').pipe(
			Config.withDefault('0 3 * * *'),
		);
		// Parse before forking so an invalid schedule fails startup visibly.
		const cron = yield* Effect.fromResult(Cron.parse(expression, 'UTC'));
		yield* backup.run().pipe(
			Effect.catchTag('DatabaseBackupError', (error) =>
				Effect.logError('Database backup failed').pipe(
					Effect.annotateLogs({ operation: error.operation }),
				),
			),
			// schedule waits for the first deadline; repeat would also run at startup.
			Effect.schedule(Schedule.cron(cron)),
			Effect.orDie,
			Effect.forkScoped,
		);
		yield* Effect.logInfo('Database backup schedule started').pipe(
			Effect.annotateLogs({ cron: expression, timezone: 'UTC' }),
		);
	}),
);
