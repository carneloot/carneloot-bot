import 'dotenv/config';

import { createBot } from './bot';
import { isDebug } from './common/utils/is-debug';
import { getSpreadsheet } from './services/sheets';

async function main() {
	if (!isDebug()) {
		return;
	}

	const { bot, setCommands } = createBot();

	bot.catch(console.error);
	await bot.start({
		onStart: async () => {
			await setCommands();
			await getSpreadsheet();
			console.log('Initialized');
		}
	});
}
main();
