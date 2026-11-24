import { Effect, Layer, Schema } from 'effect';
import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
} from 'effect/http-api';

import { Database } from '../../lib/database/db.js';
import { PetFoodNotificationQueue } from '../queue/pet-food-notification.js';
import { TelegramBot } from '../telegram/bot.js';
import { ConversationPersistence } from '../telegram/conversation-storage.js';

export const HealthGroup = HttpApiGroup.make('health').add(
	HttpApiEndpoint.get('liveness', '/api/healthz', {
		success: Schema.Struct({ status: Schema.Literal('ok') }),
	}),
	HttpApiEndpoint.get('readiness', '/api/readyz', {
		success: Schema.Struct({ status: Schema.Literal('ready') }),
		error: Schema.Struct({ status: Schema.Literal('not-ready') }).pipe(
			HttpApiSchema.status(503),
		),
	}),
);

export const HealthApi = HttpApi.make('CarnelootBot').add(HealthGroup);

export const HealthLive = HttpApiBuilder.layer(HealthApi).pipe(
	Layer.provide(
		HttpApiBuilder.group(HealthApi, 'health', (handlers) =>
			Effect.gen(function* () {
				const database = yield* Database;
				const conversationPersistence = yield* ConversationPersistence;
				const notificationQueue = yield* PetFoodNotificationQueue;
				const telegramBot = yield* TelegramBot;
				return handlers
					.handle('liveness', () => Effect.succeed({ status: 'ok' as const }))
					.handle('readiness', () =>
						Effect.all([
							database.checkHealth(),
							conversationPersistence.checkHealth,
							notificationQueue.checkHealth,
							Effect.tryPromise(() => telegramBot.checkHealth()),
						]).pipe(
							Effect.withSpan('http.readiness'),
							Effect.as({ status: 'ready' as const }),
							Effect.catchCause(() =>
								Effect.fail({ status: 'not-ready' as const }),
							),
						),
					);
			}),
		),
	),
);
