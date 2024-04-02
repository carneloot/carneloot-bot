import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import {
	notificationHistoryTable,
	notificationsTable,
	usersTable,
	usersToNotifyTable
} from '../database/schema.js';
import { db } from '../database/db.js';

export type Notification = typeof notificationsTable.$inferSelect;
type NotificationHistory = typeof notificationHistoryTable.$inferSelect;

export async function getNotificationByOwnerAndKeyword(
	ownerId: Notification['ownerID'],
	keyword: Notification['keyword']
) {
	const result = await db
		.select({
			notification: notificationsTable,
			usersToNotify: usersTable
		})
		.from(notificationsTable)
		.leftJoin(usersToNotifyTable, eq(notificationsTable.id, usersToNotifyTable.notificationID))
		.leftJoin(usersTable, eq(usersToNotifyTable.userID, usersTable.id))
		.where(
			and(eq(notificationsTable.ownerID, ownerId), eq(notificationsTable.keyword, keyword))
		)
		.all();

	const notification = result[0]?.notification;

	const usersToNotify = result.map(({ usersToNotify }) => usersToNotify).filter(Boolean);

	return { notification, usersToNotify };
}

type CreateNotificationHistory = {
	userID: NotificationHistory['userID'];
	messageID: NotificationHistory['messageID'];
	notificationID: NotificationHistory['notificationID'];
	petID: NotificationHistory['petID'];
};

export async function createNotificationHistory({
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

	await db
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
		.run();
}

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
