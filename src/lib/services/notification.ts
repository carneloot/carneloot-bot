import {
	Array,
	Console,
	Context as EffectContext,
	Data,
	Effect,
	flow,
	Iterable,
	Layer,
	Predicate,
	pipe,
	String,
} from 'effect';
import type { Bot } from 'grammy';

import type { NotifyParams } from '../../api/types/notify-params.js';
import { matchBotError } from '../../common/error.js';
import type { Context } from '../../common/types/context.js';
import type { NotificationID, PetID } from '../../lib/database/schema.js';
import { NotificationRepository } from '../repositories/notification.js';
import { type User, UserRepository } from '../repositories/user.js';

class MissingVariablesError extends Data.TaggedError('MissingVariablesError')<{
	variables: string[];
}> {}

const parseMessage = (message: string, variables: NotifyParams['variables']) =>
	Effect.gen(function* () {
		const usedVariables = pipe(
			message.matchAll(/\{\{\w+\}\}/g),
			Iterable.map((v) => v[0]),
			Iterable.map(
				flow(String.replaceAll('{', ''), String.replaceAll('}', '')),
			),
			Array.fromIterable,
		);

		if (
			Predicate.isUndefined(variables) &&
			Array.isArrayNonEmpty(usedVariables)
		) {
			return yield* new MissingVariablesError({ variables: usedVariables });
		}

		const missingVariables = Array.filter(
			usedVariables,
			(variableName) => !Predicate.hasProperty(variables, variableName),
		);
		if (Array.isArrayNonEmpty(missingVariables)) {
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

const makeNotificationService = Effect.gen(function* () {
	const notificationRepository = yield* NotificationRepository;
	const userRepository = yield* UserRepository;

	const sendNotificationAndLog = Effect.fn(
		'NotificationService.sendNotificationAndLog',
	)(function* ({
		bot,
		user,
		messageText,
		notificationID,
		petID,
	}: SendNotificationAndLog) {
		const message = yield* Effect.tryPromise({
			try: () => bot.api.sendMessage(user.telegramID, messageText),
			catch: (cause) => {
				const error = matchBotError(cause);
				if (error) return error;
				throw cause;
			},
		}).pipe(Effect.withSpan('bot.api.sendMessage'));

		yield* notificationRepository.createNotificationHistory({
			notificationID: notificationID ?? null,
			petID: petID ?? null,
			userID: user.id,
			messageID: message.message_id,
		});
	});

	const sendNotification = Effect.fn('NotificationService.sendNotification')(
		function* (bot: Bot<Context>, params: NotifyParams) {
			const user = yield* userRepository.getUserFromApiKey(params.apiKey);

			const { notification, usersToNotify } =
				yield* notificationRepository.getNotificationByOwnerAndKeyword(
					user.id,
					params.keyword,
				);

			const messageText = yield* parseMessage(
				notification.message,
				params.variables,
			);

			yield* Effect.forEach(
				[
					sendNotificationAndLog({
						bot,
						user,
						notificationID: notification.id,
						messageText,
					}),
					...usersToNotify.map((user) =>
						sendNotificationAndLog({
							bot,
							user,
							notificationID: notification.id,
							messageText,
						}),
					),
				],
				(v) =>
					v.pipe(
						Effect.catch(() =>
							Console.error('Error when sending notification to user'),
						),
					),
				{ concurrency: 'unbounded' },
			);
		},
	);

	return {
		sendNotificationAndLog,
		sendNotification,
	} as const;
});

export class NotificationService extends EffectContext.Service<
	NotificationService,
	Effect.Success<typeof makeNotificationService>
>()('app/NotificationService') {
	declare readonly sendNotificationAndLog: Effect.Success<
		typeof makeNotificationService
	>['sendNotificationAndLog'];
	declare readonly sendNotification: Effect.Success<
		typeof makeNotificationService
	>['sendNotification'];

	static readonly layer = Layer.effect(this, makeNotificationService).pipe(
		Layer.provide(NotificationRepository.layer),
		Layer.provide(UserRepository.layer),
	);
}
