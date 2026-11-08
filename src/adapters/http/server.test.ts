import { Effect } from 'effect';
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

import type { AppServices } from '../../app/layer.js';
import {
	NotificationDeliveryError,
	NotificationService,
} from '../../lib/services/notification.js';
import type { Execute } from '../execute.js';
import type { TelegramBot } from '../telegram/bot.js';
import { createHttpApp } from './server.js';

const createExecute = (
	notificationService: NotificationService['Service'],
): Execute<AppServices> =>
	((effect: Effect.Effect<unknown, unknown, NotificationService>) =>
		Effect.runPromise(
			effect.pipe(
				Effect.provideService(NotificationService, notificationService),
			),
		)) as Execute<AppServices>;

describe('POST /api/notify', () => {
	it('returns 502 when every Telegram delivery fails', async () => {
		const app = createHttpApp(
			{} as TelegramBot,
			createExecute(
				NotificationService.of({
					sendNotificationAndLog: () => Effect.die('not used'),
					sendNotification: () =>
						Effect.fail(new NotificationDeliveryError({ attempted: 2 })),
				}),
			),
			Effect.void,
		);

		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
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
					sendNotificationAndLog: () => Effect.die('not used'),
					sendNotification: () => Effect.succeed({ delivered: 1, failed: 1 }),
				}),
			),
			Effect.void,
		);

		const response = await app.request('/api/notify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
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
});
