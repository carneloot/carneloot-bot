import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('hono/bun', () => ({
	serveStatic: () => async () => undefined,
}));

vi.mock('grammy', () => ({
	webhookCallback: () => async () => new Response(),
}));

import type { Execute } from '../../../src/adapters/execute.js';
import { createHttpApp } from '../../../src/adapters/http/server.js';
import type { TelegramBot } from '../../../src/adapters/telegram/bot.js';
import type { AppServices } from '../../../src/app/layer.js';
import type { UserID } from '../../../src/lib/database/schema.js';
import { UserRepository } from '../../../src/lib/repositories/user.js';
import {
	NotificationDeliveryError,
	NotificationService,
} from '../../../src/lib/services/notification.js';

const createExecute = (
	notificationService: NotificationService['Service'],
): Execute<AppServices> =>
	((
		effect: Effect.Effect<
			unknown,
			unknown,
			NotificationService | UserRepository
		>,
	) =>
		Effect.runPromise(
			effect.pipe(
				Effect.provide(
					Layer.mergeAll(
						Layer.succeed(NotificationService, notificationService),
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
					),
				),
			),
		)) as Execute<AppServices>;

describe('POST /api/notify', () => {
	it('returns 502 when every Telegram delivery fails', async () => {
		const app = createHttpApp(
			{} as TelegramBot,
			createExecute(
				NotificationService.of({
					updateNotificationTemplate: () => Effect.die('not used'),
					sendNotificationAndLog: () => Effect.die('not used'),
					sendNotification: () =>
						Effect.fail(new NotificationDeliveryError({ attempted: 2 })),
				}),
			),
			Effect.void,
		);

		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				Authorization: 'Bearer header-api-key',
			},
			body: JSON.stringify({
				apiKey: 'api-key',
				keyword: 'test',
				variables: {},
			}),
		});

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			message: 'Notification delivery failed',
			failed: 2,
		});
	});

	it('returns 207 when only some Telegram deliveries succeed', async () => {
		const app = createHttpApp(
			{} as TelegramBot,
			createExecute(
				NotificationService.of({
					updateNotificationTemplate: () => Effect.die('not used'),
					sendNotificationAndLog: () => Effect.die('not used'),
					sendNotification: () => Effect.succeed({ delivered: 1, failed: 1 }),
				}),
			),
			Effect.void,
		);

		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				Authorization: 'Bearer header-api-key',
			},
			body: JSON.stringify({
				apiKey: 'api-key',
				keyword: 'test',
				variables: {},
			}),
		});

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
		const app = createHttpApp(
			{} as TelegramBot,
			createExecute(
				NotificationService.of({
					updateNotificationTemplate: () => Effect.die('not used'),
					sendNotificationAndLog: () => Effect.die('not used'),
					sendNotification,
				}),
			),
			Effect.void,
		);
		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				Authorization: 'Bearer header-api-key',
			},
			body: JSON.stringify({
				keyword: 'test',
				variables: { count: 2 },
				apiKey: 'ignored-body-key',
			}),
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
		{ authorization: null, status: 401 },
		{ authorization: '', status: 401 },
		{ authorization: 'Basic api-key', status: 400 },
		{ authorization: 'Bearer', status: 400 },
		{ authorization: 'Bearer key extra', status: 400 },
	])(
		'requires bearer authentication before sending: $authorization',
		async ({ authorization, status }) => {
			const sendNotification = vi.fn(() =>
				Effect.succeed({ delivered: 1, failed: 0 }),
			);
			const app = createHttpApp(
				{} as TelegramBot,
				createExecute(
					NotificationService.of({
						updateNotificationTemplate: () => Effect.die('not used'),
						sendNotificationAndLog: () => Effect.die('not used'),
						sendNotification,
					}),
				),
				Effect.void,
			);
			const response = await app.request('/api/notify', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(authorization === null ? {} : { Authorization: authorization }),
				},
				body: JSON.stringify({ keyword: 'test', apiKey: 'api-key' }),
			});
			expect(response.status).toBe(status);
			expect(response.headers.get('WWW-Authenticate')).toMatch(/^Bearer /);
			expect(sendNotification).not.toHaveBeenCalled();
		},
	);
});
