import { Effect, Layer, Schema } from 'effect';
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
import { TelegramBot } from '../telegram/bot.js';

const WebhookApi = HttpApi.make('TelegramWebhook').add(
	HttpApiGroup.make('webhook').add(
		HttpApiEndpoint.get('register', '/api/set-webhook', {
			success: Schema.Struct({ message: Schema.Literal('Done!') }),
			error: Schema.Struct({
				message: Schema.Literal('Webhook URL not set'),
			}).pipe(HttpApiSchema.status(400)),
		}),
		HttpApiEndpoint.post('receive', '/api/webhook/:secret', {
			params: { secret: Schema.String },
		}),
	),
);

export const TelegramWebhookLive = Layer.unwrap(
	Effect.gen(function* () {
		const telegramBot = yield* TelegramBot;
		const handleWebhook = webhookCallback(telegramBot.bot, 'bun');
		return HttpApiBuilder.layer(WebhookApi).pipe(
			Layer.provide(
				HttpApiBuilder.group(WebhookApi, 'webhook', (handlers) =>
					handlers
						.handle('register', () =>
							Effect.gen(function* () {
								if (!Env.WEBHOOK_URL) {
									return yield* Effect.fail({
										message: 'Webhook URL not set' as const,
									});
								}
								const url = `https://${Env.WEBHOOK_URL}/api/webhook/${Env.BOT_TOKEN}`;
								yield* Effect.promise(() => telegramBot.setWebhook(url));
								yield* Effect.promise(() => telegramBot.setCommands());
								return { message: 'Done!' as const };
							}),
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
);
