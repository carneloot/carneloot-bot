import 'dotenv/config';

import { createBot, onStart, setWebhook } from './bot';

const bot = createBot();

if (process.env.DEBUG) {
    bot.catch(console.error);
    bot.start({
        onStart: info => onStart(info, bot),
    });
} else if (process.env.VERCEL) {
    const { VERCEL_URL, BOT_TOKEN } = process.env;
    const url = `https://${VERCEL_URL}/api/${BOT_TOKEN}`;
    setWebhook(bot, url);
}
