import 'dotenv/config';

import { createBot, onStart } from './bot';
import { isDebug } from './common/utils/is-debug';

if (isDebug()) {
    const bot = createBot();

    bot.catch(console.error);
    bot.start({
        onStart: () => onStart(bot),
    });
}
