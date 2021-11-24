import 'dotenv/config';

import { createBot, onStart } from './bot';

const bot = createBot();

if (process.env.DEBUG) {
    bot.catch(console.error);
    bot.api.deleteWebhook();
    bot.start({
        onStart: () => onStart(bot),
    });
}
