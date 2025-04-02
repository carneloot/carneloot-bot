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

import type { Context } from '../../common/types/context.js';
import {
	type Notification,
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
	notification: Notification;
	messageText: string;
}

const sendNotificationAndLog = ({
	bot,
	user,
	notification,
	messageText
}: SendNotificationAndLog) =>
	Effect.gen(function* () {
		const message = yield* Effect.tryPromise(() =>
			bot.api.sendMessage(user.telegramID, messageText)
		);
		yield* createNotificationHistory({
			notificationID: notification.id,
			userID: user.id,
			messageID: message.message_id,
			petID: null
		});
	}).pipe(Effect.withSpan('sendNotificationAndLog'));

export const sendNotification = (bot: Bot<Context>, params: NotifyParams) =>
	Effect.gen(function* () {
		const user = yield* getUserFromApiKey(params.apiKey);

		const { notification, usersToNotify } =
			yield* getNotificationByOwnerAndKeyword(user.id, params.keyword);

		const message = yield* parseMessage(notification.message, params.variables);

		yield* Effect.forEach(
			[
				sendNotificationAndLog({
					bot: bot,
					user: user,
					notification: notification,
					messageText: message
				}),
				...usersToNotify.map((user) =>
					sendNotificationAndLog({
						bot: bot,
						user: user,
						notification: notification,
						messageText: message
					})
				)
			],
			(v) =>
				Effect.either(
					v.pipe(
						Effect.catchTag('UnknownException', () =>
							Console.error('Error when sending notification to user')
						)
					)
				),
			{ concurrency: 'unbounded' }
		);
	}).pipe(Effect.withSpan('sendNotification'));
