import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import { it as effectIt } from '@effect/vitest';
import { createClient } from '@libsql/client';
import { ConfigProvider, Effect, Layer, Queue } from 'effect';
import { TestClock } from 'effect/testing';
import { execFile } from 'node:child_process';
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
	BackupStore,
	DatabaseBackup,
	DatabaseBackupDailyLive,
	DatabaseBackupError,
} from '../../../src/lib/database/backup.js';

const directories: string[] = [];
const fixture = async () => {
	const parent = resolve('.amp/in/orb-backup');
	await mkdir(parent, { recursive: true });
	const directory = await mkdtemp(join(parent, 'backup-test-'));
	directories.push(directory);
	const source = join(directory, 'source.sqlite');
	const url = pathToFileURL(source).href;
	const client = createClient({ url });
	await client.execute('PRAGMA journal_mode = WAL');
	await client.execute('PRAGMA wal_autocheckpoint = 0');
	await client.execute(
		'CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
	);
	await client.execute("INSERT INTO entries VALUES (7, 'committed in WAL')");
	return { client, directory, source, url };
};

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

const backupLayer = (url: string, store: BackupStore['Service']) =>
	DatabaseBackup.layer.pipe(
		Layer.provide(Layer.succeed(BackupStore, store)),
		Layer.provide(NodeFileSystem.layer),
		Layer.provide(
			ConfigProvider.layer(ConfigProvider.fromUnknown({ DATABASE_URL: url })),
		),
	);

describe('database backup', () => {
	it('restores committed WAL data, excludes an uncommitted write, and removes the snapshot', async () => {
		const { client, url, source, directory } = await fixture();
		const transaction = await client.transaction('write');
		const started = Date.now();
		let uploadedPath = '';
		try {
			await transaction.execute(
				"INSERT INTO entries VALUES (9, 'not committed')",
			);
			expect((await stat(`${source}-wal`)).size).toBeGreaterThan(0);
			const key = await Effect.runPromise(
				DatabaseBackup.use((backup) => backup.run()).pipe(
					Effect.provide(
						backupLayer(url, {
							prune: (cutoff) =>
								Effect.sync(() => {
									expect(cutoff).toBeGreaterThanOrEqual(started - 604800000);
									expect(cutoff).toBeLessThanOrEqual(Date.now() - 604800000);
									return 0;
								}),
							upload: (_key, path) =>
								Effect.promise(async () => {
									uploadedPath = path;
									await writeFile(
										join(directory, 'restored.sqlite'),
										new Uint8Array(await readFile(path)),
									);
								}),
						}),
					),
				),
			);
			expect(key).toMatch(/^sqlite\/.*\.sqlite$/);
			const restored = createClient({
				url: pathToFileURL(join(directory, 'restored.sqlite')).href,
			});
			try {
				expect(
					(await restored.execute('PRAGMA integrity_check')).rows[0]
						?.integrity_check,
				).toBe('ok');
				expect((await restored.execute('SELECT * FROM entries')).rows).toEqual([
					{ id: 7, value: 'committed in WAL' },
				]);
			} finally {
				restored.close();
			}
			await expect(stat(uploadedPath)).rejects.toMatchObject({
				code: 'ENOENT',
			});
			await transaction.rollback();
			await client.execute("INSERT INTO entries VALUES (11, 'still writable')");
		} finally {
			transaction.close();
			client.close();
		}
	});

	it.each(['upload', 'cleanup'] as const)(
		'reports a %s failure, removes its snapshot, and leaves the source intact',
		async (operation) => {
			const { client, url } = await fixture();
			let uploadedPath = '';
			try {
				const result = await Effect.runPromise(
					DatabaseBackup.use((backup) => backup.run()).pipe(
						Effect.provide(
							backupLayer(url, {
								prune: () =>
									operation === 'cleanup'
										? Effect.fail(
												new DatabaseBackupError({ operation, cause: 'denied' }),
											)
										: Effect.die('Cleanup must not run after a failed upload'),
								upload: (_key, path) => {
									uploadedPath = path;
									return operation === 'upload'
										? Effect.fail(
												new DatabaseBackupError({
													operation: 'upload',
													cause: 'denied',
												}),
											)
										: Effect.void;
								},
							}),
						),
						Effect.flip,
					),
				);
				expect(result).toMatchObject({
					_tag: 'DatabaseBackupError',
					operation,
				});
				await expect(stat(uploadedPath)).rejects.toMatchObject({
					code: 'ENOENT',
				});
				expect(
					(await client.execute('SELECT COUNT(*) AS total FROM entries'))
						.rows[0]?.total,
				).toBe(1);
			} finally {
				client.close();
			}
		},
	);

	it.each([
		'file:/missing-backup-source.sqlite',
		'https://example.com/database',
		'file::memory:',
	])(
		'rejects an unavailable or non-file source without uploading: %s',
		async (url) => {
			let uploads = 0;
			const error = await Effect.runPromise(
				DatabaseBackup.use((backup) => backup.run()).pipe(
					Effect.provide(
						backupLayer(url, {
							prune: () =>
								Effect.die('Cleanup must not run without a snapshot'),
							upload: () =>
								Effect.sync(() => {
									uploads++;
								}),
						}),
					),
					Effect.flip,
				),
			);
			expect(error).toMatchObject({
				_tag: 'DatabaseBackupError',
				operation: 'snapshot',
			});
			expect(uploads).toBe(0);
		},
	);

	effectIt.effect(
		'waits until 03:00 UTC, continues after failure, and stops with its scope',
		() =>
			Effect.gen(function* () {
				const attempts = yield* Queue.unbounded<number>();
				let count = 0;
				const scheduled = DatabaseBackupDailyLive.pipe(
					Layer.provide(
						Layer.succeed(DatabaseBackup, {
							run: Effect.fn(function* () {
								yield* Queue.offer(attempts, ++count);
								if (count === 1) {
									return yield* Effect.fail(
										new DatabaseBackupError({
											operation: 'upload',
											cause: 'temporary',
										}),
									);
								}
								return 'key';
							}),
						}),
					),
					Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
				);
				yield* TestClock.setTime(Date.parse('2026-11-24T02:59:00Z'));
				yield* Effect.scoped(
					Effect.gen(function* () {
						yield* Layer.build(scheduled);
						yield* TestClock.adjust('59 seconds');
						expect(count).toBe(0);
						yield* TestClock.adjust('1 second');
						expect(yield* Queue.take(attempts)).toBe(1);
						yield* TestClock.adjust('24 hours');
						expect(yield* Queue.take(attempts)).toBe(2);
					}),
				);
				yield* TestClock.adjust('24 hours');
				expect(count).toBe(2);
			}),
	);

	it.each([
		{ status: 200, prepare: false, destructive: false },
		{ status: 403, prepare: false, destructive: false },
		{ status: 200, prepare: true, destructive: false },
		{ status: 403, prepare: true, destructive: false },
		{ status: 200, prepare: true, destructive: true },
	])(
		'runs the Bun backup/startup command: $status, prepare=$prepare, destructive=$destructive',
		async ({ status, prepare, destructive }) => {
			const { client, directory, url } = await fixture();
			if (prepare) {
				await client.execute('DROP TABLE entries');
				await promisify(execFile)('bun', ['run', 'db:prepare'], {
					timeout: 15000,
					env: {
						PATH: process.env.PATH,
						DATABASE_URL: url,
						DATABASE_BACKUP_ENABLED: 'false',
					},
				});
				await client.execute(
					"INSERT INTO users (id, telegram_id, first_name) VALUES ('user-7', '7', 'Before migration')",
				);
				await client.execute('DROP TABLE pet_food_scheduling_outbox');
				if (destructive) {
					await client.execute(
						'ALTER TABLE users ADD COLUMN legacy_value TEXT',
					);
					await client.execute(
						"UPDATE users SET legacy_value = 'must not disappear'",
					);
				}
			}
			const requests: {
				url: string | undefined;
				authorization: string | undefined;
				body: Uint8Array;
			}[] = [];
			const server = createServer(async (request, response) => {
				const chunks: Uint8Array[] = [];
				for await (const chunk of request) chunks.push(new Uint8Array(chunk));
				requests.push({
					url: request.url,
					authorization: request.headers.authorization,
					body: new Uint8Array(Buffer.concat(chunks)),
				});
				if (request.method === 'GET') {
					response.writeHead(200, { 'content-type': 'application/xml' });
					response.end(
						'<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
					);
					return;
				}
				response.writeHead(status, {
					'content-type': 'application/xml',
					etag: '"test-etag"',
				});
				response.end(
					status === 200
						? ''
						: '<Error><Code>AccessDenied</Code><Message>Denied</Message></Error>',
				);
			});
			await new Promise<void>((resolve) =>
				server.listen(0, '127.0.0.1', resolve),
			);
			try {
				const address = server.address();
				if (address === null || typeof address === 'string')
					throw new Error('Expected a TCP address');
				let command = prepare ? 'db:prepare' : 'db:backup';
				if (prepare && (status !== 200 || destructive)) command = 'start';
				const execution = promisify(execFile)('bun', ['run', command], {
					timeout: 15000,
					env: {
						PATH: process.env.PATH,
						DATABASE_URL: url,
						DATABASE_BACKUP_ENABLED: 'true',
						R2_BACKUP_BUCKET: 'test-backups',
						R2_BACKUP_ENDPOINT: `http://127.0.0.1:${address.port}`,
						R2_BACKUP_ACCESS_KEY_ID: 'test-access-key',
						R2_BACKUP_SECRET_ACCESS_KEY: 'test-secret-key',
					},
				}).catch((error: unknown) => {
					if (error instanceof Error && 'stdout' in error) {
						error.message += `\n${String(error.stdout)}`;
					}
					throw error;
				});
				if (status === 200 && !destructive) {
					const result = await execution;
					expect(result.stdout).toContain('Database backup uploaded');
					if (prepare)
						expect(result.stdout).toContain('Database preparation completed');
				} else {
					await expect(execution).rejects.toMatchObject({ code: 1 });
					// These commands have no bot credentials. Loading main would report BOT_TOKEN.
					await expect(execution).rejects.not.toMatchObject({
						stderr: expect.stringContaining('BOT_TOKEN'),
					});
				}
				if (prepare) {
					const migrated = await client.execute(
						"SELECT name FROM sqlite_master WHERE name = 'pet_food_scheduling_outbox'",
					);
					expect(migrated.rows).toHaveLength(
						status === 200 && !destructive ? 1 : 0,
					);
					if (destructive)
						expect(
							(await client.execute('SELECT legacy_value FROM users')).rows,
						).toEqual([{ legacy_value: 'must not disappear' }]);
				}
				expect(requests.length).toBeGreaterThan(0);
				const request = requests[0];
				expect(request?.url).toMatch(
					new RegExp(
						`^/test-backups/sqlite/${prepare ? 'pre-deploy' : 'daily'}/.*\\.sqlite$`,
					),
				);
				expect(request?.authorization).toContain(
					'AWS4-HMAC-SHA256 Credential=test-access-key/',
				);
				if (request === undefined) throw new Error('Expected an upload');
				const restoredPath = join(directory, 'uploaded.sqlite');
				await writeFile(restoredPath, request.body);
				const restored = createClient({
					url: pathToFileURL(restoredPath).href,
				});
				try {
					expect(
						(await restored.execute('PRAGMA integrity_check')).rows[0]
							?.integrity_check,
					).toBe('ok');
					if (prepare) {
						expect(
							(await restored.execute('SELECT id, first_name FROM users')).rows,
						).toEqual([{ id: 'user-7', first_name: 'Before migration' }]);
						// The uploaded snapshot must precede schema synchronization.
						expect(
							(
								await restored.execute(
									"SELECT name FROM sqlite_master WHERE name = 'pet_food_scheduling_outbox'",
								)
							).rows,
						).toHaveLength(0);
					} else {
						expect(
							(await restored.execute('SELECT * FROM entries')).rows,
						).toEqual([{ id: 7, value: 'committed in WAL' }]);
					}
				} finally {
					restored.close();
				}
			} finally {
				client.close();
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
			}
		},
		20000,
	);

	it.each([
		['none', 0],
		['none', 6],
		['none', 7],
		['none', 9],
		['list', 9],
		['list-next', 9],
		['delete', 9],
	] as const)(
		'keeps seven deployment backups and seven days of daily backups across S3 pages, failure=%s, deployments=%i',
		async (failure, count) => {
			const deleted: string[] = [];
			const listed: URL[] = [];
			const deployments = Array.from({ length: count }, (_, index) => ({
				key: `sqlite/pre-deploy/snapshot-${count - index}.sqlite`,
				// Small histories survive beyond seven days; larger histories prune even recent snapshots.
				date: `2026-11-${count > 7 ? '24' : '10'}T${String(index).padStart(2, '0')}:00:00Z`,
			})).reverse();
			const pages = [
				[
					{ key: 'sqlite/daily/old.sqlite', date: '2026-11-16T03:00:00Z' },
					{
						key: 'sqlite/daily/boundary.sqlite',
						date: '2026-11-17T03:00:00Z',
					},
					{ key: 'sqlite/daily/keep.sqlite', date: '2026-11-17T03:00:00.001Z' },
					{ key: 'unrelated/keep.sqlite', date: '2026-11-01T00:00:00Z' },
					...deployments.filter((_, index) => index % 2 === 0),
				],
				[
					...deployments.filter((_, index) => index % 2 === 1),
					{ key: 'sqlite/daily/keep.txt', date: '2026-11-01T00:00:00Z' },
					{ key: 'sqlite/daily/no-date.sqlite', date: undefined },
					{ key: 'sqlite/pre-deploy/no-date.sqlite', date: undefined },
					{ key: 'sqlite/pre-deploy/invalid-date.sqlite', date: 'invalid' },
					{ key: 'sqlite/pre-deploy/keep.txt', date: '2026-11-01T00:00:00Z' },
				],
			];
			const server = createServer((request, response) => {
				const url = new URL(request.url ?? '', 'http://test');
				if (request.method === 'DELETE')
					deleted.push(
						decodeURIComponent(url.pathname.replace('/test-backups/', '')),
					);
				if (request.method === 'GET') listed.push(url);
				if (
					(failure === 'list' && request.method === 'GET') ||
					(failure === 'list-next' &&
						request.method === 'GET' &&
						url.searchParams.has('continuation-token')) ||
					(failure === 'delete' && request.method === 'DELETE')
				) {
					response.writeHead(403, { 'content-type': 'application/xml' });
					response.end(
						'<Error><Code>AccessDenied</Code><Message>Denied</Message></Error>',
					);
					return;
				}
				if (request.method === 'DELETE') {
					response.writeHead(204).end();
					return;
				}
				const secondPage = url.searchParams.has('continuation-token');
				const objects = pages[secondPage ? 1 : 0] ?? [];
				response.writeHead(200, { 'content-type': 'application/xml' });
				response.end(
					`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>${!secondPage}</IsTruncated>${secondPage ? '' : '<NextContinuationToken>page-2</NextContinuationToken>'}${objects.map((object) => `<Contents><Key>${object.key}</Key>${object.date ? `<LastModified>${object.date}</LastModified>` : ''}</Contents>`).join('')}</ListBucketResult>`,
				);
			});
			await new Promise<void>((resolve) =>
				server.listen(0, '127.0.0.1', resolve),
			);
			try {
				const address = server.address();
				if (address === null || typeof address === 'string')
					throw new Error('Expected TCP address');
				const execution = promisify(execFile)(
					'bun',
					[
						'--eval',
						`
				import { Effect } from 'effect';
				import { BackupStore, R2BackupStoreLive } from './src/lib/database/backup.ts';
				Effect.runPromise(BackupStore.use((store) => store.prune(Date.parse('2026-11-17T03:00:00Z'))).pipe(Effect.provide(R2BackupStoreLive))).then(
					(deleted) => process.stdout.write(String(deleted)),
					(error) => { process.stderr.write(String(error)); process.exitCode = 1; },
				);
			`,
					],
					{
						timeout: 15000,
						env: {
							PATH: process.env.PATH,
							R2_BACKUP_BUCKET: 'test-backups',
							R2_BACKUP_ENDPOINT: `http://127.0.0.1:${address.port}`,
							R2_BACKUP_ACCESS_KEY_ID: 'test-access-key',
							R2_BACKUP_SECRET_ACCESS_KEY: 'test-secret-key',
						},
					},
				);
				if (failure === 'none') {
					const expected = [
						'sqlite/daily/old.sqlite',
						'sqlite/daily/boundary.sqlite',
						...(count > 7
							? [
									'sqlite/pre-deploy/snapshot-8.sqlite',
									'sqlite/pre-deploy/snapshot-9.sqlite',
								]
							: []),
					];
					expect((await execution).stdout).toBe(String(expected.length));
					expect(deleted).toEqual(expected);
					expect(listed).toHaveLength(2);
					expect(listed[1]?.searchParams.get('continuation-token')).toBe(
						'page-2',
					);
				} else {
					await expect(execution).rejects.toMatchObject({
						code: 1,
						stderr: expect.stringContaining('DatabaseBackupError'),
					});
					expect(deleted).toEqual(
						failure === 'delete' ? ['sqlite/daily/old.sqlite'] : [],
					);
				}
				expect(
					listed.every((url) => url.searchParams.get('prefix') === 'sqlite/'),
				).toBe(true);
			} finally {
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
			}
		},
		20000,
	);

	it.each([true, false])(
		'initializes a fresh database before bot startup, backups enabled=%s',
		async (enabled) => {
			const { client, source, url } = await fixture();
			client.close();
			await rm(source);
			const result = await promisify(execFile)('bun', ['run', 'db:prepare'], {
				timeout: 15000,
				env: {
					PATH: process.env.PATH,
					DATABASE_URL: url,
					DATABASE_BACKUP_ENABLED: String(enabled),
				},
			});
			expect(result.stdout).toContain('Database preparation completed');
			if (enabled) expect(result.stdout).toContain('skipping initial backup');
			const initialized = createClient({ url });
			try {
				expect(
					(
						await initialized.execute(
							"SELECT name FROM sqlite_master WHERE name = 'pet_food'",
						)
					).rows,
				).toHaveLength(1);
			} finally {
				initialized.close();
			}
		},
		20000,
	);
});
