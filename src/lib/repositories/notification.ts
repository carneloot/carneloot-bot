import { createId } from '@paralleldrive/cuid2';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Array, Data, Effect, Option, Struct } from 'effect';
import * as Database from '../database/db.js';
import {
	notificationHistoryTable,
	notificationsTable,
	usersTable,
	usersToNotifyTable
} from '../database/schema.js';

type Notification = typeof notificationsTable.$inferSelect;
type NotificationHistory = typeof notificationHistoryTable.$inferSelect;

class NotificationNotFoundError extends Data.TaggedError(
	'NotificationNotFoundError'
) {}

type CreateNotificationHistory = {
	userID: NotificationHistory['userID'];
	messageID: NotificationHistory['messageID'];
	notificationID: NotificationHistory['notificationID'];
	petID: NotificationHistory['petID'];
};

export class NotificationRepository extends Effect.Service<NotificationRepository>()(
	'app/NotificationRepository',
	{
		dependencies: [Database.layer],
		effect: Effect.gen(function* () {
			const db = yield* Database.Database;

			const getNotificationByOwnerAndKeyword = Effect.fn(
				'NotificationRepository.getNotificationByOwnerAndKeyword'
			)(function* (
				ownerId: Notification['ownerID'],
				keyword: Notification['keyword']
			) {
				const result = yield* db.execute((client) =>
					client
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
						.all()
				);

				const notification = yield* Array.head(result).pipe(
					Option.andThen(Struct.get('notification')),
					Option.match({
						onSome: Effect.succeed,
						onNone: () => Effect.fail(new NotificationNotFoundError())
					})
				);

				const usersToNotify = Array.filterMap(result, (v) =>
					Option.fromNullable(v.usersToNotify)
				);

				return { notification, usersToNotify };
			});

			const createNotificationHistory = Effect.fn(
				'NotificationRepository.createNotificationHistory'
			)(function* ({
				messageID,
				notificationID,
				petID,
				userID
			}: CreateNotificationHistory) {
				const target = [
					notificationHistoryTable.userID,
					...(notificationID ? [notificationHistoryTable.notificationID] : []),
					...(petID ? [notificationHistoryTable.petID] : [])
				];

				yield* db.execute((client) =>
					client
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
						.run()
				);
			});

			const getNotificationFromHistory = Effect.fn(
				'NotificationRepository.getNotificationFromHistory'
			)(function* (
				messageID: NotificationHistory['messageID'],
				userID: NotificationHistory['userID']
			) {
				const ownerHistory = alias(notificationHistoryTable, 'ownerHistory');

				const result = yield* db.execute((client) =>
					client
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
						.leftJoin(
							ownerHistory,
							eq(notificationsTable.ownerID, ownerHistory.userID)
						)
						.leftJoin(usersTable, eq(notificationsTable.ownerID, usersTable.id))
						.where(
							and(
								eq(notificationHistoryTable.messageID, messageID),
								eq(notificationHistoryTable.userID, userID)
							)
						)
						.get()
				);

				if (!result) {
					return yield* new NotificationNotFoundError();
				}

				return result;
			});

			return {
				getNotificationByOwnerAndKeyword,
				getNotificationFromHistory,
				createNotificationHistory
			} as const;
		})
	}
) {}
