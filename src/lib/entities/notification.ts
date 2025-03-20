import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Array as A, Data, Effect, Option, Struct } from 'effect';

import { db } from '../database/db.js';
import { DatabaseError } from '../database/error.js';
import {
	notificationHistoryTable,
	notificationsTable,
	usersTable,
	usersToNotifyTable
} from '../database/schema.js';

export type Notification = typeof notificationsTable.$inferSelect;
type NotificationHistory = typeof notificationHistoryTable.$inferSelect;

class NotificationNotFoundError extends Data.TaggedError(
	'NotificationNotFoundError'
) {}

export const getNotificationByOwnerAndKeyword = (
	ownerId: Notification['ownerID'],
	keyword: Notification['keyword']
) =>
	Effect.gen(function* () {
		const result = yield* Effect.tryPromise({
			try: () =>
				db
					.select({
						notification: notificationsTable,
						usersToNotify: usersTable
					})
					.from(notificationsTable)
					.leftJoin(
						usersToNotifyTable,
						eq(notificationsTable.id, usersToNotifyTable.notificationID)
					)
					.leftJoin(usersTable, eq(usersToNotifyTable.userID, usersTable.id))
					.where(
						and(
							eq(notificationsTable.ownerID, ownerId),
							eq(notificationsTable.keyword, keyword)
						)
					)
					.all(),
			catch: (err) => new DatabaseError({ cause: err })
		});

		const notification = yield* A.head(result).pipe(
			Option.andThen(Struct.get('notification')),
			Option.match({
				onSome: Effect.succeed,
				onNone: () => Effect.fail(new NotificationNotFoundError())
			})
		);

		const usersToNotify = A.filterMap(result, (v) =>
			Option.fromNullable(v.usersToNotify)
		);

		return { notification, usersToNotify };
	});

type CreateNotificationHistory = {
	userID: NotificationHistory['userID'];
	messageID: NotificationHistory['messageID'];
	notificationID: NotificationHistory['notificationID'];
	petID: NotificationHistory['petID'];
};

export const createNotificationHistory = ({
	messageID,
	notificationID,
	petID,
	userID
}: CreateNotificationHistory) =>
	Effect.gen(function* () {
		const target = [
			notificationHistoryTable.userID,
			...(notificationID ? [notificationHistoryTable.notificationID] : []),
			...(petID ? [notificationHistoryTable.petID] : [])
		];

		yield* Effect.tryPromise({
			try: () =>
				db
					.insert(notificationHistoryTable)
					.values({
						id: createId() as NotificationHistory['id'],
						messageID,
						notificationID,
						petID,
						userID,
						sentAt: new Date()
					})
					.onConflictDoUpdate({
						target,
						set: {
							messageID,
							sentAt: new Date()
						}
					})
					.run(),
			catch: (err) => new DatabaseError({ cause: err })
		});
	});

export async function getNotificationFromHistory(
	messageID: NotificationHistory['messageID'],
	userID: NotificationHistory['userID']
) {
	const ownerHistory = alias(notificationHistoryTable, 'ownerHistory');

	return db
		.select({
			messageToReply: ownerHistory.messageID,
			ownerTelegramId: usersTable.telegramID,
			ownerID: usersTable.id,
			keyword: notificationsTable.keyword,
			petID: notificationHistoryTable.petID
		})
		.from(notificationHistoryTable)
		.leftJoin(
			notificationsTable,
			eq(notificationHistoryTable.notificationID, notificationsTable.id)
		)
		.leftJoin(ownerHistory, eq(notificationsTable.ownerID, ownerHistory.userID))
		.leftJoin(usersTable, eq(notificationsTable.ownerID, usersTable.id))
		.where(
			and(
				eq(notificationHistoryTable.messageID, messageID),
				eq(notificationHistoryTable.userID, userID)
			)
		)
		.get();
}
