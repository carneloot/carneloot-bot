import { run } from '@grammyjs/runner';
import { Effect } from 'effect';

import type { TelegramBot } from './bot.js';

export const startPolling = (telegramBot: TelegramBot) =>
	Effect.gen(function* () {
		yield* Effect.tryPromise(() => telegramBot.setCommands());
		yield* Effect.tryPromise(() =>
			telegramBot.bot.api.deleteWebhook({ drop_pending_updates: true }),
		);

		const handle = run(telegramBot.bot);

		yield* Effect.addFinalizer(() => Effect.promise(() => handle.stop()));
	});
