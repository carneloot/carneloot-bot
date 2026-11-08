import { sValidator } from '@hono/standard-validator';
import { Effect } from 'effect';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { logger } from 'hono/logger';

import { NotifyParams } from '../../api/types/notify-params.js';
import type { AppServices } from '../../app/layer.js';
import { Env } from '../../common/env.js';
import { NotificationService } from '../../lib/services/notification.js';
import type { Execute } from '../execute.js';
import type { TelegramBot } from '../telegram/bot.js';
import { createHealthApp } from './health.js';

export type Readiness = Effect.Effect<void, unknown, AppServices>;

export const createHttpApp = (
	telegramBot: TelegramBot,
	execute: Execute<AppServices>,
	readiness: Readiness,
) => {
	const app = new Hono();
	const api = new Hono();
	const handleWebhook = webhookCallback(telegramBot.bot, 'hono');

	app.use(logger());

	api.route(
		'/',
		createHealthApp(() =>
			execute(readiness.pipe(Effect.withSpan('http.readiness'))),
		),
	);

	api.post('notify', sValidator('json', NotifyParams), (context) =>
		execute(
			Effect.gen(function* () {
				const body = context.req.valid('json');
				const notificationService = yield* NotificationService;

				return yield* notificationService.sendNotification(body).pipe(
					Effect.map((outcome) =>
						outcome.failed === 0
							? context.json({ message: 'Notification sent successfully!' })
							: context.json(
									{
										message: 'Notification partially delivered',
										delivered: outcome.delivered,
										failed: outcome.failed,
									},
									207,
								),
					),
					Effect.catchTags({
						NotificationDeliveryError: (error) =>
							Effect.succeed(
								context.json(
									{
										message: 'Notification delivery failed',
										failed: error.attempted,
									},
									502,
								),
							),
						UserNotFoundError: () =>
							Effect.succeed(
								context.json({ message: 'User not found for apiKey' }, 404),
							),
						MissingVariablesError: (error) =>
							Effect.succeed(
								context.json(
									{
										message: 'Missing used variables',
										variables: error.variables,
									},
									422,
								),
							),
						NotificationNotFoundError: () =>
							Effect.succeed(
								context.json(
									{
										message: 'Notification not found for user and keyword',
									},
									404,
								),
							),
						DatabaseError: () =>
							Effect.succeed(context.json({ message: 'Database error' }, 500)),
					}),
				);
			}).pipe(Effect.withSpan('/api/post/notify')),
		),
	);

	if (Env.RUN_MODE === 'webhook') {
		api.get('/set-webhook', (context) => {
			if (!Env.WEBHOOK_URL) {
				return context.json({ message: 'Webhook URL not set' }, 400);
			}

			const url = `https://${Env.WEBHOOK_URL}/api/webhook/${Env.BOT_TOKEN}`;

			return execute(
				Effect.tryPromise(() => telegramBot.setWebhook(url)).pipe(
					Effect.andThen(() =>
						Effect.tryPromise(() => telegramBot.setCommands()),
					),
					Effect.as(context.json({ message: 'Done!' })),
				),
			);
		});

		api.post('/webhook/:secret', (context) =>
			execute(Effect.promise(async () => handleWebhook(context))),
		);
	}

	app.route('/api', api);
	app.use('*', serveStatic({ root: '../public/' }));

	return app;
};

export const startHttpServer = (
	telegramBot: TelegramBot,
	execute: Execute<AppServices>,
	readiness: Readiness,
) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const app = createHttpApp(telegramBot, execute, readiness);

			return Bun.serve({
				fetch: app.fetch,
				port: Env.PORT,
			});
		}),
		(server) => Effect.promise(() => server.stop()),
	);
