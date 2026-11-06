import { Context, Effect, Layer, Redacted } from 'effect';
import { Bot } from 'grammy';

import { Env } from '../../common/env.js';
import { matchBotError } from '../../common/error.js';
import type { Context as TelegramContext } from '../../common/types/context.js';

type NotificationSenderService = {
	readonly sendMessage: (
		telegramID: string,
		message: string,
	) => Effect.Effect<{ readonly messageID: number }, unknown>;
};

export class NotificationSender extends Context.Service<
	NotificationSender,
	NotificationSenderService
>()('app/NotificationSender') {}

export const NotificationSenderLive = Layer.effect(
	NotificationSender,
	Effect.sync(() => {
		const bot = new Bot<TelegramContext>(Env.BOT_TOKEN.pipe(Redacted.value));

		return NotificationSender.of({
			sendMessage: (telegramID, message) =>
				Effect.tryPromise({
					try: () => bot.api.sendMessage(telegramID, message),
					catch: (cause) => {
						const error = matchBotError(cause);
						if (error) return error;
						throw cause;
					},
				}).pipe(
					Effect.map((sentMessage) => ({ messageID: sentMessage.message_id })),
					Effect.withSpan('telegram.sendMessage'),
				),
		});
	}),
);
