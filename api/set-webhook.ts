import { createBot, onStart, setWebhook } from '../src/bot';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
    if (process.env.VERCEL_ENV !== 'production') {
        return res
            .status(401)
            .json({ message: 'Deployment must be production' });
    }

    const bot = createBot();

    const { VERCEL_URL, BOT_TOKEN } = process.env;
    const url = `https://${VERCEL_URL}/api/${BOT_TOKEN}`;
    await setWebhook(bot, url);
    await onStart(bot);

    res
        .status(200)
        .json({ message: 'Done!' });
}