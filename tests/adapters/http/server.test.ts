import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import { Effect, Layer } from 'effect';
import { Bot, MemorySessionStorage } from 'grammy';
import {
	afterEach,
	assert,
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

import { HttpLive } from '../../../src/adapters/http/server.js';
import { PetFoodNotificationQueue } from '../../../src/adapters/queue/pet-food-notification.js';
import { TelegramBot } from '../../../src/adapters/telegram/bot.js';
import { ConversationPersistence } from '../../../src/adapters/telegram/conversation-storage.js';
import { Env } from '../../../src/common/env.js';
import type { Context } from '../../../src/common/types/context.js';
import { Database } from '../../../src/lib/database/db.js';
import type { UserID } from '../../../src/lib/database/schema.js';
import { NotificationRepository } from '../../../src/lib/repositories/notification.js';
import { UserRepository } from '../../../src/lib/repositories/user.js';
import {
	NotificationDeliveryError,
	NotificationService,
} from '../../../src/lib/services/notification.js';
import { createTestHttp } from '../../support/http.js';
import { createTestRedis } from '../../support/test-redis.js';

const originalEnv = { ...Env };

let telegramBot: TelegramBot;
let redis: ReturnType<typeof createTestRedis>;

const storedSecret = () => {
	const secret = [...redis.values.values()][0];
	assert(secret);
	return secret;
};

beforeEach(() => {
	redis = createTestRedis();
	Object.assign(Env, { RUN_MODE: 'polling', WEBHOOK_URL: 'test.example' });
	telegramBot = {
		bot: new Bot<Context>('123:test'),
		checkHealth: async () => undefined,
		setWebhook: vi.fn(async () => true),
		setCommands: vi.fn(async () => undefined),
	};
	telegramBot.bot.botInfo = {
		id: 123,
		is_bot: true,
		first_name: 'Test',
		username: 'test_bot',
		can_join_groups: true,
		can_read_all_group_messages: false,
		supports_inline_queries: false,
		can_connect_to_business: false,
		has_main_web_app: false,
		has_topics_enabled: false,
		allows_users_to_create_topics: false,
		can_manage_bots: false,
		supports_join_request_queries: false,
	};
});

const createApp = (
	sendNotification: NotificationService['Service']['sendNotification'] = () =>
		Effect.succeed({ delivered: 1, failed: 0 }),
) =>
	createTestHttp(
		HttpLive.pipe(
			Layer.provide([
				redis.layer,
				Layer.succeed(TelegramBot, telegramBot),
				Layer.mock(Database, {
					checkHealth: () => Effect.void,
					makeQuery: () => {
						throw new Error('not used');
					},
				}),
				Layer.mock(ConversationPersistence, {
					checkHealth: Effect.void,
					storage: {
						type: 'key',
						adapter: new MemorySessionStorage<
							VersionedState<ConversationData>
						>(),
					},
				}),
				Layer.mock(PetFoodNotificationQueue, { checkHealth: Effect.void }),
				Layer.mock(NotificationService, {
					sendNotification,
					updateNotificationTemplate: () => Effect.succeed(undefined),
				}),
				Layer.mock(NotificationRepository, {}),
				Layer.mock(UserRepository, {
					getUserFromApiKey: () =>
						Effect.succeed({
							id: 'owner' as UserID,
							telegramID: '1',
							firstName: 'Test',
							lastName: null,
							username: null,
						}),
				}),
			]),
		),
	);

const notify = (
	app: ReturnType<typeof createApp>,
	body: unknown = { keyword: 'test', variables: {} },
) =>
	app.request('/api/notify', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			Authorization: 'Bearer header-api-key',
		},
		body: JSON.stringify(body),
	});

afterEach(() => {
	Object.assign(Env, originalEnv);
	redis.close();
	vi.restoreAllMocks();
});

describe('POST /api/notify', () => {
	it('returns 502 when every Telegram delivery fails', async () => {
		const app = createApp(() =>
			Effect.fail(new NotificationDeliveryError({ attempted: 2 })),
		);
		const response = await notify(app);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			message: 'Notification delivery failed',
			failed: 2,
		});
	});

	it('returns 207 when only some Telegram deliveries succeed', async () => {
		const response = await notify(
			createApp(() => Effect.succeed({ delivered: 1, failed: 1 })),
		);
		expect(response.status).toBe(207);
		expect(await response.json()).toEqual({
			message: 'Notification partially delivered',
			delivered: 1,
			failed: 1,
		});
	});

	it('returns 200 on complete delivery and uses only the header API key', async () => {
		const sendNotification = vi.fn(() =>
			Effect.succeed({ delivered: 2, failed: 0 }),
		);
		const response = await notify(createApp(sendNotification), {
			keyword: 'test',
			variables: { count: 2 },
			apiKey: 'ignored-body-key',
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			message: 'Notification sent successfully!',
		});
		expect(sendNotification).toHaveBeenCalledWith({
			keyword: 'test',
			variables: { count: 2 },
			apiKey: 'header-api-key',
		});
	});

	it.each([
		{ authorization: null, status: 401, challenge: 'Bearer realm=""' },
		{ authorization: '', status: 401, challenge: 'Bearer realm=""' },
		...['Basic api-key', 'Bearer', 'Bearer key extra', 'bearer key'].map(
			(authorization) => ({
				authorization,
				status: 400,
				challenge: 'Bearer error="invalid_request"',
			}),
		),
	])(
		'requires bearer authentication before body validation: $authorization',
		async ({ authorization, status, challenge }) => {
			const sendNotification = vi.fn(() =>
				Effect.succeed({ delivered: 1, failed: 0 }),
			);
			const response = await createApp(sendNotification).request(
				'/api/notify',
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						...(authorization === null ? {} : { Authorization: authorization }),
					},
					body: '{invalid-json',
				},
			);
			expect(response.status).toBe(status);
			expect(response.headers.get('WWW-Authenticate')).toBe(challenge);
			expect(await response.json()).toEqual({
				message:
					status === 401 ? 'Unauthorized' : 'Malformed Authorization header',
			});
			expect(sendNotification).not.toHaveBeenCalled();
		},
	);
});

describe('API validation responses', () => {
	it.each([
		{ contentType: 'application/json', status: 200 },
		{ contentType: 'application/json; charset=utf-8', status: 200 },
		{ contentType: 'application/vnd.api+json', status: 200 },
		{ contentType: 'text/plain', status: 400 },
		{ contentType: 'application/x-www-form-urlencoded', status: 400 },
		{ contentType: null, status: 400 },
	])(
		'retains JSON media-type handling for $contentType',
		async ({ contentType, status }) => {
			const response = await createApp().request('/api/notify', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer header-api-key',
					...(contentType === null ? {} : { 'content-type': contentType }),
				},
				body: new TextEncoder().encode(
					JSON.stringify({ keyword: 'test', variables: {} }),
				),
			});
			expect(response.status).toBe(status);
			expect(await response.json()).toEqual({
				message:
					status === 200
						? 'Notification sent successfully!'
						: 'Invalid request body',
			});
		},
	);

	it.each([
		{
			method: 'POST',
			path: '/api/notify',
			valid: { variables: { title: 'Finished' } },
			invalid: { variables: { title: false } },
		},
		{
			method: 'PATCH',
			path: '/api/notifications',
			valid: { message: '{{title}}' },
			invalid: { message: '' },
		},
	])(
		'does not expose request data on $method $path',
		async ({ method, path, valid, invalid }) => {
			const app = createApp();
			const request = (body: string) =>
				app.request(path, {
					method,
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-secret-api-key',
					},
					body,
				});
			const fields = {
				apiKey: 'test-secret-api-key',
				keyword: 'test-keyword',
				privateField: 'private request data',
			};
			for (const apiKey of [fields.apiKey, { nestedSecret: fields.apiKey }]) {
				const response = await request(
					JSON.stringify({ ...fields, ...invalid, apiKey }),
				);
				expect(response.status).toBe(400);
				expect(await response.json()).toEqual({
					message: 'Invalid request body',
				});
			}
			const malformed = await request('{"secret":"private request data"');
			expect(malformed.status).toBe(400);
			expect(await malformed.json()).toEqual({
				message: 'Invalid request body',
			});
			expect(
				(await request(JSON.stringify({ keyword: fields.keyword, ...valid })))
					.status,
			).toBe(200);
		},
	);
});

describe('HTTP route composition', () => {
	it('serves health endpoints alongside notification routes and returns 404 for unknown paths', async () => {
		const app = createApp();
		expect(await (await app.request('/api/healthz')).json()).toEqual({
			status: 'ok',
		});
		expect(await (await app.request('/api/readyz')).json()).toEqual({
			status: 'ready',
		});
		expect((await app.request('/missing')).status).toBe(404);
	});

	it('does not register webhook endpoints in polling mode', async () => {
		redis.setAvailable(false);
		const app = createApp();
		expect((await app.request('/api/healthz')).status).toBe(200);
		expect((await app.request('/api/set-webhook')).status).toBe(404);
		expect((await app.request('/api/webhook', { method: 'POST' })).status).toBe(
			404,
		);
		expect(telegramBot.setWebhook).not.toHaveBeenCalled();
		expect(redis.values.size).toBe(0);
	});

	it('returns the existing error when webhook mode has no webhook URL', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook', WEBHOOK_URL: undefined });
		const response = await createApp().request('/api/set-webhook');
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message: 'Webhook URL not set' });
	});

	it('registers the webhook and commands in webhook mode', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook', WEBHOOK_URL: 'test.example' });
		const response = await createApp().request('/api/set-webhook');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ message: 'Done!' });
		expect(telegramBot.setWebhook).toHaveBeenCalledWith(
			'https://test.example/api/webhook',
			storedSecret(),
		);
		expect(telegramBot.setCommands).toHaveBeenCalled();
	});

	it('generates and stores a secret and registers automatically at startup', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		expect((await createApp().request('/api/healthz')).status).toBe(200);
		expect(storedSecret()).toMatch(/^[0-9a-f]{64}$/);
		expect(redis.values.size).toBe(1);
		expect(telegramBot.setWebhook).toHaveBeenCalledExactlyOnceWith(
			'https://test.example/api/webhook',
			storedSecret(),
		);
		expect(telegramBot.setCommands).toHaveBeenCalledOnce();
	});

	it('shares one secret across concurrent starts and subsequent restarts', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		const responses = await Promise.all([
			createApp().request('/api/healthz'),
			createApp().request('/api/healthz'),
		]);
		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		const secret = storedSecret();
		expect((await createApp().request('/api/healthz')).status).toBe(200);
		expect(redis.values.size).toBe(1);
		expect(storedSecret()).toBe(secret);
		expect(vi.mocked(telegramBot.setWebhook).mock.calls).toEqual([
			['https://test.example/api/webhook', secret],
			['https://test.example/api/webhook', secret],
			['https://test.example/api/webhook', secret],
		]);
	});

	it('keeps different bots isolated in shared Redis', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		await createApp().request('/api/healthz');
		const firstSecret = storedSecret();
		telegramBot.bot.botInfo = { ...telegramBot.bot.botInfo, id: 456 };
		await createApp().request('/api/healthz');
		expect(redis.values.size).toBe(2);
		const secrets = [...redis.values.values()];
		expect(secrets[0]).toBe(firstSecret);
		expect(secrets[1]).toMatch(/^[0-9a-f]{64}$/);
		expect(secrets[1]).not.toBe(firstSecret);
	});

	it('fails startup rather than registering when Redis is unavailable', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		redis.setAvailable(false);
		await expect(createApp().request('/api/healthz')).rejects.toThrow();
		expect(telegramBot.setWebhook).not.toHaveBeenCalled();
	});

	it.each(['', 'malformed-private-value'])(
		'rejects an invalid persisted secret without exposing it: %s',
		async (value) => {
			Object.assign(Env, { RUN_MODE: 'webhook' });
			await createApp().request('/api/healthz');
			const [key] = redis.values.keys();
			assert(key);
			redis.values.set(key, value);
			vi.mocked(telegramBot.setWebhook).mockClear();
			const error = await createApp()
				.request('/api/healthz')
				.catch((cause: unknown) => cause);
			expect(error).toBeInstanceOf(Error);
			if (value) expect(String(error)).not.toContain(value);
			expect(telegramBot.setWebhook).not.toHaveBeenCalled();
		},
	);

	it('fails startup if Telegram rejects webhook registration', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		vi.mocked(telegramBot.setWebhook).mockRejectedValueOnce(
			new Error('Telegram unavailable'),
		);
		await expect(createApp().request('/api/healthz')).rejects.toThrow();
	});

	it('passes webhook JSON through the native request bridge to grammY', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		const received = vi.fn();
		telegramBot.bot.use(async (context) => {
			received(context.update);
		});
		const update = { update_id: 1234 };
		const app = createApp();
		await app.request('/api/healthz');
		const response = await app.request('/api/webhook', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'X-Telegram-Bot-Api-Secret-Token': storedSecret(),
			},
			body: JSON.stringify(update),
		});
		expect(response.status).toBe(200);
		expect(received).toHaveBeenCalledWith(update);
	});

	it.each(['missing', 'incorrect', 'bot token'])(
		'rejects webhook requests with a missing or invalid secret: %s',
		async (kind) => {
			Object.assign(Env, { RUN_MODE: 'webhook' });
			const received = vi.fn();
			telegramBot.bot.use(async (context) => {
				received(context.update);
			});
			const app = createApp();
			await app.request('/api/healthz');
			const stored = storedSecret();
			const secret =
				kind === 'missing'
					? undefined
					: kind === 'bot token'
						? 'test-token'
						: `${stored.slice(0, -1)}${stored.endsWith('0') ? '1' : '0'}`;
			const response = await app.request('/api/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(secret === undefined
						? {}
						: { 'X-Telegram-Bot-Api-Secret-Token': secret }),
				},
				body: JSON.stringify({ update_id: 5678 }),
			});
			expect(response.status).toBe(401);
			expect(received).not.toHaveBeenCalled();
		},
	);

	it('does not expose the old secret-in-path webhook endpoint', async () => {
		Object.assign(Env, { RUN_MODE: 'webhook' });
		const response = await createApp().request('/api/webhook/test-token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ update_id: 5678 }),
		});
		expect(response.status).toBe(404);
	});
});
