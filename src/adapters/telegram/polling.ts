import { run } from '@grammyjs/runner';
import { Effect, Layer } from 'effect';

import { TelegramBot } from './bot.js';

export const TelegramPollingLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const telegramBot = yield* TelegramBot;
		yield* Effect.tryPromise(() => telegramBot.setCommands());
		yield* Effect.tryPromise(() =>
			telegramBot.bot.api.deleteWebhook({ drop_pending_updates: true }),
		);

		yield* Effect.acquireRelease(
			Effect.sync(() => run(telegramBot.bot)),
			(handle) => Effect.promise(() => handle.stop()),
		);
	}),
);
