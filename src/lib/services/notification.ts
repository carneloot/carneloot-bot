import {
	Array,
	Console,
	Data,
	Effect,
	flow,
	Iterable,
	Predicate,
	pipe,
	String
} from 'effect';
import type { Bot } from 'grammy';

import type { NotifyParams } from '../../api/types/notify-params.js';
import { matchBotError } from '../../common/error.js';
import type { Context } from '../../common/types/context.js';
import type { NotificationID, PetID } from '../../lib/database/schema.js';
import { getUserFromApiKey, type User } from '../../lib/entities/user.js';
import { NotificationRepository } from '../repositories/notification.js';

class MissingVariablesError extends Data.TaggedError('MissingVariablesError')<{
	variables: string[];
}> {}

const parseMessage = (message: string, variables: NotifyParams['variables']) =>
	Effect.gen(function* () {
		const usedVariables = pipe(
			message.matchAll(/\{\{\w+\}\}/g),
			Iterable.map((v) => v[0]),
			Iterable.map(
				flow(String.replaceAll('{', ''), String.replaceAll('}', ''))
			),
			Array.fromIterable
		);

		if (
			Predicate.isUndefined(variables) &&
			Array.isNonEmptyArray(usedVariables)
		) {
			return yield* new MissingVariablesError({ variables: usedVariables });
		}

		const missingVariables = Array.filter(
			usedVariables,
			(variableName) => !Predicate.hasProperty(variables, variableName)
		);
		if (Array.isNonEmptyArray(missingVariables)) {
			return yield* new MissingVariablesError({ variables: missingVariables });
		}

		const finalMessage = variables
			? Object.entries(variables).reduce((acc, [key, value]) => {
					return acc.replace(`{{${key}}}`, value.toString());
				}, message)
			: message;
		return finalMessage;
	}).pipe(Effect.withSpan('parseMessage'));

interface SendNotificationAndLog {
	bot: Bot<Context>;
	user: User;
	notificationID?: NotificationID;
	petID?: PetID;
	messageText: string;
}

export class NotificationService extends Effect.Service<NotificationService>()(
	'app/NotificationService',
	{
		dependencies: [NotificationRepository.Default],
		effect: Effect.gen(function* () {
			const notificationRepository = yield* NotificationRepository;

			const sendNotificationAndLog = Effect.fn(
				'NotificationService.sendNotificationAndLog'
			)(function* ({
				bot,
				user,
				messageText,
				notificationID,
				petID
			}: SendNotificationAndLog) {
				const message = yield* Effect.tryPromise({
					try: () => bot.api.sendMessage(user.telegramID, messageText),
					catch: (cause) => {
						const error = matchBotError(cause);
						if (error) return error;
						throw cause;
					}
				}).pipe(Effect.withSpan('bot.api.sendMessage'));

				yield* notificationRepository.createNotificationHistory({
					notificationID: notificationID ?? null,
					petID: petID ?? null,
					userID: user.id,
					messageID: message.message_id
				});
			});

			const sendNotification = Effect.fn(
				'NotificationService.sendNotification'
			)(function* (bot: Bot<Context>, params: NotifyParams) {
				const user = yield* getUserFromApiKey(params.apiKey);

				const { notification, usersToNotify } =
					yield* notificationRepository.getNotificationByOwnerAndKeyword(
						user.id,
						params.keyword
					);

				const messageText = yield* parseMessage(
					notification.message,
					params.variables
				);

				yield* Effect.forEach(
					[
						sendNotificationAndLog({
							bot,
							user,
							notificationID: notification.id,
							messageText
						}),
						...usersToNotify.map((user) =>
							sendNotificationAndLog({
								bot,
								user,
								notificationID: notification.id,
								messageText
							})
						)
					],
					(v) =>
						Effect.either(
							v.pipe(
								Effect.catchAll(() =>
									Console.error('Error when sending notification to user')
								)
							)
						),
					{ concurrency: 'unbounded' }
				);
			});

			return {
				sendNotificationAndLog,
				sendNotification
			} as const;
		})
	}
) {}
