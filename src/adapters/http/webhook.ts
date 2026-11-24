import { Effect, Layer, Redacted, Schema } from 'effect';
import { SecureRandom } from 'effect/crypto';
import { Hex } from 'effect/encoding';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
} from 'effect/http-api';
import { webhookCallback } from 'grammy';

import { Env } from '../../common/env.js';
import { Redis } from '../../lib/redis/redis.js';
import { TelegramBot } from '../telegram/bot.js';

const WebhookSecret = Schema.RedactedFromValue(Schema.String).check(
	Schema.makeFilter(
		(secret) => {
			const value = Redacted.value(secret);
			return value.length === 64 && !/[^0-9a-f]/.test(value);
		},
		{ message: 'Invalid persisted Telegram webhook secret' },
	),
);

const WebhookApi = HttpApi.make('TelegramWebhook').add(
	HttpApiGroup.make('webhook').add(
		HttpApiEndpoint.get('register', '/api/set-webhook', {
			success: Schema.Struct({ message: Schema.Literal('Done!') }),
			error: Schema.Struct({
				message: Schema.Literal('Webhook URL not set'),
			}).pipe(HttpApiSchema.status(400)),
		}),
		HttpApiEndpoint.post('receive', '/api/webhook'),
	),
);

export const TelegramWebhookLive = Layer.unwrap(
	Effect.gen(function* () {
		const telegramBot = yield* TelegramBot;
		const redis = yield* Redis;
		const random = yield* SecureRandom.SecureRandom;
		yield* Effect.tryPromise(() => telegramBot.bot.init());
		const key = `telegram:webhook-secret:${telegramBot.bot.botInfo.id}`;
		const candidate = Hex.encode(yield* random.randomBytes(32));
		const stored = yield* Effect.tryPromise(async () => {
			await redis.client.set(key, candidate, 'NX');
			return redis.client.get(key);
		});
		const secret = yield* Schema.decodeUnknownEffect(WebhookSecret)(stored);
		const secretToken = Redacted.value(secret);
		const handleWebhook = webhookCallback(telegramBot.bot, 'bun', {
			secretToken,
		});
		const register = Effect.fn('TelegramWebhook.register')(function* () {
			if (!Env.WEBHOOK_URL) {
				return yield* Effect.fail({ message: 'Webhook URL not set' as const });
			}
			const url = `https://${Env.WEBHOOK_URL}/api/webhook`;
			yield* Effect.tryPromise(() => telegramBot.setWebhook(url, secretToken));
			yield* Effect.tryPromise(() => telegramBot.setCommands());
			return { message: 'Done!' as const };
		});
		if (Env.WEBHOOK_URL) yield* register();

		return HttpApiBuilder.layer(WebhookApi).pipe(
			Layer.provide(
				HttpApiBuilder.group(WebhookApi, 'webhook', (handlers) =>
					handlers
						.handle('register', () =>
							register().pipe(Effect.catchTag('UnknownError', Effect.die)),
						)
						.handleRaw('receive', () =>
							Effect.gen(function* () {
								const request = yield* HttpServerRequest.HttpServerRequest;
								const webRequest = yield* HttpServerRequest.toWeb(request).pipe(
									Effect.orDie,
								);
								const response = yield* Effect.promise(() =>
									handleWebhook(webRequest),
								);
								return HttpServerResponse.fromWeb(response);
							}),
						),
				),
			),
		);
	}),
).pipe(Layer.provide(SecureRandom.layerWebCrypto));
