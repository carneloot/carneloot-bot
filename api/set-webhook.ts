import { createBot } from '../src/bot.js';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Env } from '../src/common/env.js';

export default async (req: VercelRequest, res: VercelResponse) => {
	if (Env.VERCEL_ENV !== 'production') {
		return res.status(401).json({ message: 'Deployment must be production' });
	}

	const { setCommands, setWebhook } = createBot();

	const server = Env.WEBHOOK_URL ?? Env.VERCEL_URL;

	const url = `https://${server}/api/${Env.BOT_TOKEN}`;
	await setWebhook(url);
	await setCommands();

	res.status(200).json({ message: 'Done!' });
};
