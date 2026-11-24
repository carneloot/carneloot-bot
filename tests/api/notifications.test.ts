import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	// Share the in-memory database across LibSQL transaction connections.
	process.env.DATABASE_URL = 'file::memory:?cache=shared';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { NotificationSender } from '../../src/adapters/telegram/notification-sender.js';
import {
	NotificationsApi,
	NotificationsLive,
} from '../../src/api/notifications.js';
import { hashString } from '../../src/common/utils/hash-string.js';
import { Database, layer as databaseLayer } from '../../src/lib/database/db.js';
import type { NotificationID, UserID } from '../../src/lib/database/schema.js';
import { NotificationRepository } from '../../src/lib/repositories/notification.js';
import { UserRepository } from '../../src/lib/repositories/user.js';
import { NotificationService } from '../../src/lib/services/notification.js';
import { createTestHttp } from '../support/http.js';

const persistenceLayer = Layer.mergeAll(
	NotificationRepository.layer,
	UserRepository.layer,
).pipe(Layer.provideMerge(databaseLayer));
const testLayer = NotificationService.layer.pipe(
	Layer.provideMerge(
		Layer.mergeAll(
			persistenceLayer,
			Layer.succeed(
				NotificationSender,
				NotificationSender.of({ sendMessage: () => Effect.die('not used') }),
			),
		),
	),
);
const runtime = ManagedRuntime.make(testLayer);
const httpLayer = HttpApiBuilder.layer(NotificationsApi).pipe(
	Layer.provide(NotificationsLive),
	Layer.provide(Layer.effectContext(Effect.promise(() => runtime.context()))),
);
let app: ReturnType<typeof createTestHttp>;
const patch = (
	body: unknown,
	authorization: string | null = 'Bearer test-owner-key',
) =>
	app.request('/api/notifications', {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...(authorization === null ? {} : { Authorization: authorization }),
		},
		body: JSON.stringify(body),
	});
const post = (
	body: unknown,
	authorization: string | null = 'Bearer test-owner-key',
) =>
	app.request('/api/notifications', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(authorization === null ? {} : { Authorization: authorization }),
		},
		body: JSON.stringify(body),
	});
const getTemplate = (owner = 'owner-1', keyword = 'claude_done') =>
	runtime.runPromise(
		Effect.gen(function* () {
			const repository = yield* NotificationRepository;
			return yield* repository.getNotificationByOwnerAndKeyword(
				owner as UserID,
				keyword,
			);
		}),
	);

describe('/api/notifications', () => {
	beforeAll(async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database;
				yield* db.execute((client) =>
					client.$client.executeMultiple(`
				PRAGMA foreign_keys = ON;
				CREATE TABLE users (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL,
					first_name TEXT NOT NULL, last_name TEXT, username TEXT);
				CREATE TABLE api_keys (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id),
					key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
				CREATE TABLE notifications (id TEXT PRIMARY KEY, keyword TEXT NOT NULL,
					message TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), UNIQUE(keyword, owner_id));
				CREATE TABLE users_to_notify (id TEXT PRIMARY KEY, notification_id TEXT REFERENCES notifications(id),
					user_id TEXT REFERENCES users(id));
				CREATE TABLE notification_history (id TEXT PRIMARY KEY, notification_id TEXT REFERENCES notifications(id),
					pet_id TEXT, user_id TEXT REFERENCES users(id), message_id INTEGER NOT NULL, sent_at INTEGER NOT NULL);
				INSERT INTO users (id, telegram_id, first_name) VALUES
					('owner-1', '1', 'Test'), ('owner-2', '2', 'Other');
			`),
				);
				yield* db.execute((client) =>
					client.$client.execute({
						sql: 'INSERT INTO api_keys (id, user_id, key, created_at) VALUES (?, ?, ?, ?)',
						args: ['key-1', 'owner-1', hashString('test-owner-key'), 0],
					}),
				);
			}),
		);
	});
	afterAll(async () => {
		await runtime.dispose();
	});
	beforeEach(async () => {
		app = createTestHttp(httpLayer);
		await runtime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database;
				yield* db.execute((client) =>
					client.$client.executeMultiple(`
				DROP TRIGGER IF EXISTS prevent_template_delete;
				DELETE FROM notification_history;
				DELETE FROM users_to_notify;
				DELETE FROM notifications;
				INSERT INTO notifications (id, keyword, message, owner_id) VALUES
					('template-1', 'claude_done', 'Original', 'owner-1'),
					('template-2', 'claude_done', 'Other owner', 'owner-2'),
					('template-3', 'private_template', 'Private', 'owner-2');
				INSERT INTO users_to_notify (id, notification_id, user_id) VALUES ('recipient-1', 'template-1', 'owner-2');
			`),
				);
			}),
		);
	});

	it.each(['✅ {{project}}\n🏷️ {{title}}\n\n💬 {{message}}', 'x'.repeat(4096)])(
		'updates a message without changing its identity, keyword, recipients, or another owner',
		async (message) => {
			const body = {
				keyword: 'claude_done',
				message,
			};
			const response = await patch(body);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				message: 'Notification template updated successfully!',
			});
			// Repeating an update is safe and does not create a new template.
			expect((await patch(body)).status).toBe(200);
			const result = await getTemplate();
			expect(result.notification).toEqual({
				id: 'template-1',
				ownerID: 'owner-1',
				keyword: 'claude_done',
				message,
			});
			expect(result.usersToNotify.map((user) => user.id)).toEqual(['owner-2']);
			expect((await getTemplate('owner-2')).notification.message).toBe(
				'Other owner',
			);
		},
	);

	it('rejects an invalid API key without modifying the template', async () => {
		const response = await patch(
			{
				apiKey: 'test-owner-key',
				keyword: 'claude_done',
				message: 'Unauthorized',
			},
			'Bearer wrong-key',
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			message: 'Unauthorized',
		});
		expect((await getTemplate()).notification.message).toBe('Original');
	});

	it.each([
		{ authorization: null, status: 401, message: 'Unauthorized' },
		{ authorization: '', status: 401, message: 'Unauthorized' },
		...['Basic test-owner-key', 'Bearer', 'Bearer key extra'].map(
			(authorization) => ({
				authorization,
				status: 400,
				message: 'Malformed Authorization header',
			}),
		),
	])(
		'rejects missing or malformed authorization even with a valid body API key',
		async ({ authorization, status, message }) => {
			const response = await patch(
				{
					apiKey: 'test-owner-key',
					keyword: 'claude_done',
					message: 'Unauthorized',
				},
				authorization,
			);
			expect(response.status).toBe(status);
			expect(response.headers.get('WWW-Authenticate')).toMatch(/^Bearer /);
			expect(await response.json()).toEqual({
				message,
			});
			expect((await getTemplate()).notification.message).toBe('Original');
		},
	);

	it('ignores a body API key when a header API key is provided', async () => {
		const response = await patch(
			{
				apiKey: 'wrong-body-key',
				keyword: 'claude_done',
				message: 'Authenticated by header',
			},
			'Bearer test-owner-key',
		);
		expect(response.status).toBe(200);
		expect((await getTemplate()).notification.message).toBe(
			'Authenticated by header',
		);
	});

	it.each(['missing_template', 'private_template'])(
		'does not create or modify inaccessible templates',
		async (keyword) => {
			const response = await patch({
				keyword,
				message: 'Unauthorized',
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				message: 'Notification not found for user and keyword',
			});
			await expect(getTemplate('owner-1', keyword)).rejects.toMatchObject({
				_tag: 'NotificationNotFoundError',
			});
			expect(
				(await getTemplate('owner-2', 'private_template')).notification.message,
			).toBe('Private');
		},
	);

	it.each([
		{ message: 'Message' },
		{ keyword: 'claude_done' },
		...['', ' \n\t ', 'x'.repeat(4097), null, 42].map((message) => ({
			keyword: 'claude_done',
			message,
		})),
	])(
		'rejects invalid request bodies without changing the saved message',
		async (body) => {
			const response = await patch(body);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				message: 'Invalid request body',
			});
			expect((await getTemplate()).notification.message).toBe('Original');
		},
	);

	it('POST creates a template for the authenticated owner without copying another owner’s recipients', async () => {
		const response = await post({
			keyword: 'private_template',
			message: '✅ {{title}}',
			ownerID: 'owner-2',
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			message: 'Notification template created successfully!',
		});
		const result = await getTemplate('owner-1', 'private_template');
		expect(result.notification).toMatchObject({
			ownerID: 'owner-1',
			keyword: 'private_template',
			message: '✅ {{title}}',
		});
		expect(result.usersToNotify).toEqual([]);
		expect(
			(await getTemplate('owner-2', 'private_template')).notification.message,
		).toBe('Private');
	});

	it('POST rejects an existing keyword without overwriting its message or recipients', async () => {
		const response = await post({
			keyword: 'claude_done',
			message: 'Replacement',
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			message: 'Notification template already exists for user and keyword',
		});
		const result = await getTemplate();
		expect(result.notification.message).toBe('Original');
		expect(result.usersToNotify.map((user) => user.id)).toEqual(['owner-2']);
	});

	it('POST handles concurrent requests for the same keyword without duplicate creation', async () => {
		const responses = await Promise.all(
			['First', 'Second'].map((message) =>
				post({ keyword: 'new_keyword', message }),
			),
		);
		expect(responses.map((response) => response.status).sort()).toEqual([
			201, 409,
		]);
		const winner = responses.findIndex((response) => response.status === 201);
		expect(
			(await getTemplate('owner-1', 'new_keyword')).notification.message,
		).toBe(['First', 'Second'][winner]);
	});

	it.each([
		{ authorization: null, status: 401 },
		{ authorization: 'Bearer wrong-key', status: 401 },
		{ authorization: 'Basic test-owner-key', status: 400 },
	])(
		'POST requires bearer authentication',
		async ({ authorization, status }) => {
			const response = await post(
				{
					keyword: 'new_keyword',
					message: 'Message',
					apiKey: 'test-owner-key',
				},
				authorization,
			);
			expect(response.status).toBe(status);
			expect(JSON.stringify(await response.json())).not.toContain(
				'test-owner-key',
			);
			await expect(getTemplate('owner-1', 'new_keyword')).rejects.toMatchObject(
				{ _tag: 'NotificationNotFoundError' },
			);
		},
	);

	it.each([
		{ message: 'Message' },
		{ keyword: 'new_keyword' },
		...['', 'two words', ' \n '].map((keyword) => ({
			keyword,
			message: 'Message',
		})),
		...['', ' \n ', 'x'.repeat(4097)].map((message) => ({
			keyword: 'new_keyword',
			message,
		})),
	])(
		'POST rejects invalid input without exposing request data or creating a template',
		async (body) => {
			const response = await post({ ...body, apiKey: 'test-owner-key' });
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				message: 'Invalid request body',
			});
			await expect(getTemplate('owner-1', 'new_keyword')).rejects.toMatchObject(
				{ _tag: 'NotificationNotFoundError' },
			);
		},
	);

	it.each(['missing_template', 'private_template'])(
		'notify returns 404 for missing or inaccessible templates: %s',
		async (keyword) => {
			const response = await app.request('/api/notify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer test-owner-key',
				},
				body: JSON.stringify({ keyword, variables: {} }),
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				message: 'Notification not found for user and keyword',
			});
		},
	);

	it('notify returns 422 and only missing variable names before attempting delivery', async () => {
		await patch({ keyword: 'claude_done', message: '{{title}} {{count}}' });
		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer test-owner-key',
			},
			body: JSON.stringify({
				keyword: 'claude_done',
				variables: { title: 'Finished' },
			}),
		});
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({
			message: 'Missing used variables',
			variables: ['count'],
		});
	});

	it('repository lists only the owner templates in keyword order', async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				yield* repository.createNotification(
					'owner-1' as UserID,
					'zebra',
					'Last',
				);
				yield* repository.createNotification(
					'owner-1' as UserID,
					'alpha',
					'First',
				);
				const rows = yield* repository.getNotificationsByOwner(
					'owner-1' as UserID,
				);
				expect(rows.map((row) => row.keyword)).toEqual([
					'alpha',
					'claude_done',
					'zebra',
				]);
				expect(rows.every((row) => row.ownerID === 'owner-1')).toBe(true);
				expect(
					yield* repository.getNotificationsByOwner('missing' as UserID),
				).toEqual([]);
			}),
		);
	});

	it('repository updates by owner and id without touching inaccessible templates', async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				expect(
					yield* repository.updateNotification(
						'owner-1' as UserID,
						'template-2' as NotificationID,
						'Forbidden',
					),
				).toBe(false);
				expect(
					yield* repository.updateNotification(
						'owner-1' as UserID,
						'missing' as NotificationID,
						'Missing',
					),
				).toBe(false);
				expect(
					yield* repository.updateNotification(
						'owner-1' as UserID,
						'template-1' as NotificationID,
						'Updated',
					),
				).toBe(true);
			}),
		);
		expect((await getTemplate()).notification.message).toBe('Updated');
		expect((await getTemplate('owner-2')).notification.message).toBe(
			'Other owner',
		);
	});

	it('repository deletion refuses missing and other owner ids without deleting recipients', async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const repository = yield* NotificationRepository;
				expect(
					yield* repository.deleteNotification(
						'owner-2' as UserID,
						'template-1' as NotificationID,
					),
				).toBe(false);
				expect(
					yield* repository.deleteNotification(
						'owner-1' as UserID,
						'missing' as NotificationID,
					),
				).toBe(false);
			}),
		);
		expect((await getTemplate()).usersToNotify.map((user) => user.id)).toEqual([
			'owner-2',
		]);
	});

	it.each([false, true])(
		'repository deletion is atomic when deletion is blocked: %s',
		async (blocked) => {
			await runtime.runPromise(
				Effect.gen(function* () {
					const db = yield* Database;
					yield* db.execute((client) =>
						client.$client.executeMultiple(`
				INSERT INTO notification_history (id, notification_id, user_id, message_id, sent_at)
				VALUES ('history-1', 'template-1', 'owner-1', 123, 0);
				${
					blocked
						? `CREATE TRIGGER prevent_template_delete BEFORE DELETE ON notifications
				BEGIN SELECT RAISE(ABORT, 'blocked deletion'); END;`
						: ''
				}
			`),
					);
				}),
			);
			const deletion = runtime.runPromise(
				Effect.gen(function* () {
					const repository = yield* NotificationRepository;
					return yield* repository.deleteNotification(
						'owner-1' as UserID,
						'template-1' as NotificationID,
					);
				}),
			);
			if (blocked) {
				await expect(deletion).rejects.toBeDefined();
				expect(
					(await getTemplate()).usersToNotify.map((user) => user.id),
				).toEqual(['owner-2']);
			} else {
				expect(await deletion).toBe(true);
				await expect(getTemplate()).rejects.toMatchObject({
					_tag: 'NotificationNotFoundError',
				});
			}
			await runtime.runPromise(
				Effect.gen(function* () {
					const db = yield* Database;
					const result = yield* db.execute((client) =>
						client.$client.execute('SELECT * FROM notification_history'),
					);
					expect(result.rows).toHaveLength(blocked ? 1 : 0);
					const recipients = yield* db.execute((client) =>
						client.$client.execute('SELECT * FROM users_to_notify'),
					);
					expect(recipients.rows).toHaveLength(blocked ? 1 : 0);
				}),
			);
			expect((await getTemplate('owner-2')).notification.message).toBe(
				'Other owner',
			);
		},
	);
});
