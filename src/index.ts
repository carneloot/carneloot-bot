import 'dotenv/config';

import { createBot, onStart } from './bot';

if (process.env.DEBUG) {
    const bot = createBot();

    bot.catch(console.error);
    bot.start({
        onStart: () => onStart(bot),
    });
}
