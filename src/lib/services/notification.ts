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

import { NotificationSender } from '../../adapters/telegram/notification-sender.js';
import type { NotifyParams } from '../../api/types/notify-params.js';
import type { NotificationID, PetID } from '../../lib/database/schema.js';
import { NotificationRepository } from '../repositories/notification.js';
import { type User, UserRepository } from '../repositories/user.js';

class MissingVariablesError extends Data.TaggedError('MissingVariablesError')<{
	variables: string[];
}> {}

export class NotificationDeliveryError extends Data.TaggedError(
	'NotificationDeliveryError',
)<{
	attempted: number;
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
	user: User;
	notificationID?: NotificationID;
	petID?: PetID;
	messageText: string;
}

export const makeNotificationService = Effect.gen(function* () {
	const notificationRepository = yield* NotificationRepository;
	const userRepository = yield* UserRepository;
	const notificationSender = yield* NotificationSender;

	const sendNotificationAndLog = Effect.fn(
		'NotificationService.sendNotificationAndLog',
	)(function* ({
		user,
		messageText,
		notificationID,
		petID,
	}: SendNotificationAndLog) {
		const message = yield* notificationSender.sendMessage(
			user.telegramID,
			messageText,
		);

		yield* notificationRepository.createNotificationHistory({
			notificationID: notificationID ?? null,
			petID: petID ?? null,
			userID: user.id,
			messageID: message.messageID,
		});
	});

	const sendNotification = Effect.fn('NotificationService.sendNotification')(
		function* (params: NotifyParams) {
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

			const outcomes = yield* Effect.forEach(
				[
					sendNotificationAndLog({
						user,
						notificationID: notification.id,
						messageText,
					}),
					...usersToNotify.map((user) =>
						sendNotificationAndLog({
							user,
							notificationID: notification.id,
							messageText,
						}),
					),
				],
				(v) =>
					v.pipe(
						Effect.as(true),
						Effect.catch(() =>
							Console.error('Error when sending notification to user').pipe(
								Effect.as(false),
							),
						),
					),
				{ concurrency: 'unbounded' },
			);

			const delivered = outcomes.filter(Boolean).length;
			if (delivered === 0) {
				return yield* new NotificationDeliveryError({
					attempted: outcomes.length,
				});
			}

			return { delivered, failed: outcomes.length - delivered };
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

	static readonly layer = Layer.effect(this, makeNotificationService);
}
