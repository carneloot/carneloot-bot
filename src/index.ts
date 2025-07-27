import { sValidator } from '@hono/standard-validator';

import { Effect } from 'effect';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { logger } from 'hono/logger';
import { NotifyParams } from './api/types/notify-params.js';
import { createBot } from './bot.js';
import { Env } from './common/env.js';
import { PetFoodNotificationQueue } from './lib/queues/pet-food-notification.js';
import { NotificationService } from './lib/services/notification.js';
import { runtime } from './runtime.js';

const { bot, setCommands, setWebhook } = createBot();

bot.catch(console.error);

const app = new Hono();

app.use(logger());

const api = new Hono();

api.post('notify', sValidator('json', NotifyParams), (c) =>
	Effect.gen(function* () {
		const body = c.req.valid('json');

		const notificationService = yield* NotificationService;

		return yield* notificationService.sendNotification(bot, body).pipe(
			Effect.map(() => c.json({ message: 'Notification sent successfully!' })),
			Effect.catchTags({
				UserNotFoundError: () =>
					Effect.succeed(c.json({ message: 'User not found for apiKey' }, 404)),
				MissingVariablesError: (err) =>
					Effect.succeed(
						c.json(
							{ message: 'Missing used variables', variables: err.variables },
							422
						)
					),
				NotificationNotFoundError: () =>
					Effect.succeed(
						c.json(
							{ message: 'Notification not found for user and keyword' },
							404
						)
					),
				DatabaseError: () =>
					Effect.succeed(c.json({ message: 'Database error' }, 500))
			})
		);
	}).pipe(Effect.withSpan('/api/post/notify'), runtime.runPromise)
);

if (Env.RUN_MODE === 'webhook') {
	api.get('/set-webhook', async (c) => {
		if (!Env.WEBHOOK_URL) {
			return c.json({ message: 'Webhook URL not set' }, 400);
		}

		const url = `https://${Env.WEBHOOK_URL}/api/webhook/${Env.BOT_TOKEN}`;

		await setWebhook(url);
		await setCommands();

		return c.json({ message: 'Done!' });
	});

	api.post('/webhook/:secret', webhookCallback(bot, 'hono'));
}

// Manually start the queue since the bot is not dependent on effect
await PetFoodNotificationQueue.pipe(runtime.runPromise);

app.route('/api', api);
app.use('*', serveStatic({ root: '../public/' }));

Bun.serve({
	fetch: app.fetch,
	port: Env.PORT
});

if (Env.RUN_MODE === 'polling') {
	await bot.start({
		onStart: setCommands,
		drop_pending_updates: true
	});
}
