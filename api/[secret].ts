import { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';

import { createBot } from '../src/bot';

const bot = createBot();

const { BOT_TOKEN } = process.env;

export default (req: VercelRequest, res: VercelResponse) => {
	const reqSecret = req.query.secret;
	if (reqSecret !== BOT_TOKEN) {
		res.status(401).send({
			message: 'You do not have access.'
		});
		return;
	}

	webhookCallback(bot, 'https')(req, res);
};
