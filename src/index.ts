import { sValidator } from '@hono/standard-validator';

import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { logger } from 'hono/logger';

import { createBot } from './bot.js';

import { sendNotification } from './api/actions/send-notification.js';
import { NotifyParams } from './api/types/notify-params.js';
import { Env } from './common/env.js';
import { petFoodNotificationJob } from './lib/queues/pet-food-notification.js';

const { bot, setCommands, setWebhook } = createBot();

bot.catch(console.error);

const app = new Hono();

app.use(logger());

const api = new Hono();

api.post('notify', sValidator('json', NotifyParams), async (c) => {
	const body = c.req.valid('json');

	try {
		await sendNotification(bot, body);
	} catch (e: unknown) {
		console.error('Error sending notification', e);
		return c.json({ message: 'Internal error' }, 500);
	}

	return c.json({ message: 'Notification sent successfully!' });
});

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

const worker = petFoodNotificationJob.createWorker();

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
