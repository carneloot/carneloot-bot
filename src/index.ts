import { createMiddleware } from '@trigger.dev/hono';

import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { createBot } from './bot.js';

import { sendNotification } from './api/actions/send-notification.js';
import { NotifyParams } from './api/types/notify-params.js';
import { Env } from './common/env.js';
import { triggerClient } from './lib/trigger/trigger-client.js';

import './lib/trigger/pet-food-notification.job.js';

const { bot, setCommands, setWebhook } = createBot();

bot.catch(console.error);

const app = new Hono();

app.use(logger());

const api = new Hono();

api
	.post('notify', async (c) => {
		const parsedBodyResult = NotifyParams.safeParse(await c.req.json());

		if (!parsedBodyResult.success) {
			return c.json(
				{
					message: 'Invalid body',
					error: parsedBodyResult.error.flatten().fieldErrors
				},
				400
			);
		}

		const { data: body } = parsedBodyResult;

		try {
			await sendNotification(bot, body);
		} catch (e: unknown) {
			return c.json({ message: 'Internal error' }, 500);
		}

		return c.json({ message: 'Notification sent successfully!' });
	})
	.use('/trigger', createMiddleware(triggerClient));

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

app.route('/api', api);

Bun.serve({
	...app,
	port: Env.PORT
});

if (Env.RUN_MODE === 'polling') {
	await bot.start({
		onStart: setCommands,
		drop_pending_updates: true
	});
}
