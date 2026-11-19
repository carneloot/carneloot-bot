import { Effect } from 'effect';
import { Hono } from 'hono';
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
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('../../src/runtime.js', async () => {
	const { Layer, ManagedRuntime } = await import('effect');
	const Database = await import('../../src/lib/database/db.js');
	const { NotificationRepository } =
		await import('../../src/lib/repositories/notification.js');
	const { NotificationService } =
		await import('../../src/lib/services/notification.js');
	return {
		runtime: ManagedRuntime.make(
			Layer.mergeAll(
				Database.layer,
				NotificationRepository.layer,
				NotificationService.layer,
			),
		),
	};
});

import { notificationsApi } from '../../src/api/notifications.js';
import { hashString } from '../../src/common/utils/hash-string.js';
import { Database } from '../../src/lib/database/db.js';
import type { UserID } from '../../src/lib/database/schema.js';
import { NotificationRepository } from '../../src/lib/repositories/notification.js';
import { runtime } from '../../src/runtime.js';

const app = new Hono().route('/api', notificationsApi);
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
	afterAll(() => runtime.dispose());
	beforeEach(async () => {
		await runtime.runPromise(
			Effect.gen(function* () {
				const db = yield* Database;
				yield* db.execute((client) =>
					client.$client.executeMultiple(`
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
});
