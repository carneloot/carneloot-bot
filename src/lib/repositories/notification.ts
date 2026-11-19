import { createId } from '@paralleldrive/cuid2';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Array, Context, Data, Effect, Layer, Option, Struct } from 'effect';

import * as Database from '../database/db.js';
import {
	notificationHistoryTable,
	notificationsTable,
	usersTable,
	usersToNotifyTable,
} from '../database/schema.js';

type Notification = typeof notificationsTable.$inferSelect;
type NotificationHistory = typeof notificationHistoryTable.$inferSelect;

class NotificationNotFoundError extends Data.TaggedError(
	'NotificationNotFoundError',
) {}

type CreateNotificationHistory = {
	userID: NotificationHistory['userID'];
	messageID: NotificationHistory['messageID'];
	notificationID: NotificationHistory['notificationID'];
	petID: NotificationHistory['petID'];
};

const makeNotificationRepository = Effect.gen(function* () {
	const db = yield* Database.Database;

	const createNotification = Effect.fn(
		'NotificationRepository.createNotification',
	)(function* (
		ownerID: Notification['ownerID'],
		keyword: Notification['keyword'],
		message: Notification['message'],
	) {
		const result = yield* db.execute((client) =>
			client
				.insert(notificationsTable)
				.values({
					id: createId() as Notification['id'],
					ownerID,
					keyword,
					message,
				})
				.onConflictDoNothing({
					target: [notificationsTable.keyword, notificationsTable.ownerID],
				})
				.returning({ id: notificationsTable.id })
				.get(),
		);

		return result !== undefined;
	});

	const getNotificationsByOwner = Effect.fn(
		'NotificationRepository.getNotificationsByOwner',
	)(function* (ownerID: Notification['ownerID']) {
		return yield* db.execute((client) =>
			client
				.select()
				.from(notificationsTable)
				.where(eq(notificationsTable.ownerID, ownerID))
				.orderBy(notificationsTable.keyword)
				.all(),
		);
	});

	const updateNotification = Effect.fn(
		'NotificationRepository.updateNotification',
	)(function* (
		ownerID: Notification['ownerID'],
		id: Notification['id'],
		message: string,
	) {
		const result = yield* db.execute((client) =>
			client
				.update(notificationsTable)
				.set({ message })
				.where(
					and(
						eq(notificationsTable.ownerID, ownerID),
						eq(notificationsTable.id, id),
					),
				)
				.returning({ id: notificationsTable.id })
				.get(),
		);
		return result !== undefined;
	});

	const deleteNotification = Effect.fn(
		'NotificationRepository.deleteNotification',
	)(function* (ownerID: Notification['ownerID'], id: Notification['id']) {
		return yield* db.execute((client) =>
			client.transaction(async (tx) => {
				const where = and(
					eq(notificationsTable.ownerID, ownerID),
					eq(notificationsTable.id, id),
				);
				const notification = await tx
					.select({ id: notificationsTable.id })
					.from(notificationsTable)
					.where(where)
					.get();
				if (!notification) return false;

				await tx
					.delete(notificationHistoryTable)
					.where(eq(notificationHistoryTable.notificationID, id))
					.run();
				await tx
					.delete(usersToNotifyTable)
					.where(eq(usersToNotifyTable.notificationID, id))
					.run();
				await tx.delete(notificationsTable).where(where).run();
				return true;
			}),
		);
	});

	const getNotificationByOwnerAndKeyword = Effect.fn(
		'NotificationRepository.getNotificationByOwnerAndKeyword',
	)(function* (
		ownerId: Notification['ownerID'],
		keyword: Notification['keyword'],
	) {
		const result = yield* db.execute((client) =>
			client
				.select({
					notification: notificationsTable,
					usersToNotify: usersTable,
				})
				.from(notificationsTable)
				.leftJoin(
					usersToNotifyTable,
					eq(notificationsTable.id, usersToNotifyTable.notificationID),
				)
				.leftJoin(usersTable, eq(usersToNotifyTable.userID, usersTable.id))
				.where(
					and(
						eq(notificationsTable.ownerID, ownerId),
						eq(notificationsTable.keyword, keyword),
					),
				)
				.all(),
		);

		const notification = yield* Array.head(result).pipe(
			Option.andThen(Struct.get('notification')),
			Option.match({
				onSome: Effect.succeed,
				onNone: () => Effect.fail(new NotificationNotFoundError()),
			}),
		);

		const usersToNotify = result.flatMap((v) =>
			v.usersToNotify === null ? [] : [v.usersToNotify],
		);

		return { notification, usersToNotify };
	});

	const createNotificationHistory = Effect.fn(
		'NotificationRepository.createNotificationHistory',
	)(function* ({
		messageID,
		notificationID,
		petID,
		userID,
	}: CreateNotificationHistory) {
		const target = [
			notificationHistoryTable.userID,
			...(notificationID ? [notificationHistoryTable.notificationID] : []),
			...(petID ? [notificationHistoryTable.petID] : []),
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
					sentAt: new Date(),
				})
				.onConflictDoUpdate({
					target,
					set: {
						messageID,
						sentAt: new Date(),
					},
				})
				.run(),
		);
	});

	const getNotificationFromHistory = Effect.fn(
		'NotificationRepository.getNotificationFromHistory',
	)(function* (
		messageID: NotificationHistory['messageID'],
		userID: NotificationHistory['userID'],
	) {
		const ownerHistory = alias(notificationHistoryTable, 'ownerHistory');

		const result = yield* db.execute((client) =>
			client
				.select({
					messageToReply: ownerHistory.messageID,
					ownerTelegramId: usersTable.telegramID,
					ownerID: usersTable.id,
					keyword: notificationsTable.keyword,
					petID: notificationHistoryTable.petID,
				})
				.from(notificationHistoryTable)
				.leftJoin(
					notificationsTable,
					eq(notificationHistoryTable.notificationID, notificationsTable.id),
				)
				.leftJoin(
					ownerHistory,
					eq(notificationsTable.ownerID, ownerHistory.userID),
				)
				.leftJoin(usersTable, eq(notificationsTable.ownerID, usersTable.id))
				.where(
					and(
						eq(notificationHistoryTable.messageID, messageID),
						eq(notificationHistoryTable.userID, userID),
					),
				)
				.get(),
		);

		if (!result) {
			return yield* new NotificationNotFoundError();
		}

		return result;
	});

	return {
		createNotification,
		getNotificationsByOwner,
		updateNotification,
		deleteNotification,
		getNotificationByOwnerAndKeyword,
		getNotificationFromHistory,
		createNotificationHistory,
	} as const;
});

export class NotificationRepository extends Context.Service<
	NotificationRepository,
	Effect.Success<typeof makeNotificationRepository>
>()('app/NotificationRepository') {
	declare readonly getNotificationsByOwner: Effect.Success<
		typeof makeNotificationRepository
	>['getNotificationsByOwner'];
	declare readonly updateNotification: Effect.Success<
		typeof makeNotificationRepository
	>['updateNotification'];
	declare readonly deleteNotification: Effect.Success<
		typeof makeNotificationRepository
	>['deleteNotification'];
	declare readonly createNotification: Effect.Success<
		typeof makeNotificationRepository
	>['createNotification'];
	declare readonly getNotificationByOwnerAndKeyword: Effect.Success<
		typeof makeNotificationRepository
	>['getNotificationByOwnerAndKeyword'];
	declare readonly getNotificationFromHistory: Effect.Success<
		typeof makeNotificationRepository
	>['getNotificationFromHistory'];
	declare readonly createNotificationHistory: Effect.Success<
		typeof makeNotificationRepository
	>['createNotificationHistory'];

	static readonly layer = Layer.effect(this, makeNotificationRepository).pipe(
		Layer.provide(Database.layer),
	);
}
