import 'dotenv/config';

import { createBot } from './bot';
import { isDebug } from './common/utils/is-debug';

async function main() {
	if (!isDebug()) {
		return;
	}

	const { bot, setCommands } = createBot();

	bot.catch(console.error);
	await bot.start({
		onStart: setCommands,
		drop_pending_updates: true
	});
}
main();
