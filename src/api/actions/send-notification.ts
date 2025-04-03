import {
	Array as A,
	Console,
	Data,
	Effect,
	Iterable,
	Predicate,
	String as Str,
	flow,
	pipe
} from 'effect';
import type { Bot } from 'grammy';

import { matchBotError } from '../../common/error.js';
import type { Context } from '../../common/types/context.js';
import type { NotificationID, PetID } from '../../lib/database/schema.js';
import {
	createNotificationHistory,
	getNotificationByOwnerAndKeyword
} from '../../lib/entities/notification.js';
import { type User, getUserFromApiKey } from '../../lib/entities/user.js';
import type { NotifyParams } from '../types/notify-params.js';

class MissingVariablesError extends Data.TaggedError('MissingVariablesError')<{
	variables: string[];
}> {}

const parseMessage = (message: string, variables: NotifyParams['variables']) =>
	Effect.gen(function* () {
		const usedVariables = pipe(
			message.matchAll(/\{\{\w+\}\}/g),
			Iterable.map((v) => v[0]),
			Iterable.map(flow(Str.replaceAll('{', ''), Str.replaceAll('}', ''))),
			A.fromIterable
		);

		if (Predicate.isUndefined(variables) && A.isNonEmptyArray(usedVariables)) {
			return yield* new MissingVariablesError({ variables: usedVariables });
		}

		const missingVariables = A.filter(
			usedVariables,
			(variableName) => !Predicate.hasProperty(variables, variableName)
		);
		if (A.isNonEmptyArray(missingVariables)) {
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

export const sendNotificationAndLog = ({
	bot,
	user,
	messageText,
	notificationID,
	petID
}: SendNotificationAndLog) =>
	Effect.gen(function* () {
		const message = yield* Effect.tryPromise({
			try: () => bot.api.sendMessage(user.telegramID, messageText),
			catch: (cause) => {
				const error = matchBotError(cause);
				if (error) return error;
				throw cause;
			}
		}).pipe(Effect.withSpan('bot.api.sendMessage'));

		yield* createNotificationHistory({
			notificationID: notificationID ?? null,
			petID: petID ?? null,
			userID: user.id,
			messageID: message.message_id
		});
	}).pipe(Effect.withSpan('sendNotificationAndLog'));

export const sendNotification = (bot: Bot<Context>, params: NotifyParams) =>
	Effect.gen(function* () {
		const user = yield* getUserFromApiKey(params.apiKey);

		const { notification, usersToNotify } =
			yield* getNotificationByOwnerAndKeyword(user.id, params.keyword);

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
	}).pipe(Effect.withSpan('sendNotification'));
