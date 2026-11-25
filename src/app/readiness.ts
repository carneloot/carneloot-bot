import { Effect } from 'effect';

import { PetFoodNotificationQueue } from '../adapters/queue/pet-food-notification.js';
import { TelegramBot } from '../adapters/telegram/bot.js';
import { ConversationPersistence } from '../adapters/telegram/conversation-storage.js';
import { Database } from '../lib/database/db.js';

export const makeReadinessCheck = Effect.gen(function* () {
	const database = yield* Database;
	const conversationPersistence = yield* ConversationPersistence;
	const notificationQueue = yield* PetFoodNotificationQueue;
	const telegramBot = yield* TelegramBot;

	return Effect.all(
		[
			database.checkHealth(),
			conversationPersistence.checkHealth,
			notificationQueue.checkHealth,
			Effect.tryPromise(() => telegramBot.checkHealth()).pipe(
				Effect.withSpan('telegram-bot.health'),
			),
		],
		{ concurrency: 'unbounded' },
	).pipe(Effect.asVoid);
});
