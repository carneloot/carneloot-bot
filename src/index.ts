import { createMiddleware } from '@trigger.dev/hono';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';

import { createBot } from './bot.js';

import { Env } from './common/env.js';
import { NotifyParams } from './api/types/notify-params.js';
import { sendNotification } from './api/actions/send-notification.js';
import { triggerClient } from './lib/trigger/trigger-client.js';
import { logger } from 'hono/logger';

const { bot, setCommands, setWebhook } = createBot();

bot.catch(console.error);

const app = new Hono();

app.use(logger());

const api = new Hono();

api
	.post('notify', async (c) => {
		const parsedBodyResult = NotifyParams.safeParse(c.req.json());

		if (!parsedBodyResult.success) {
			return c.json({ message: 'Invalid body' }, 400);
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

	api.post('/webhook/:secret', async (c) => {
		const { secret } = c.req.param();
		if (secret !== Env.BOT_TOKEN) {
			return c.json({ message: 'Unauthorized' }, 401);
		}

		webhookCallback(bot, 'hono')(c.req, c.res);
	});
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
