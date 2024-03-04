import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import {
	notificationHistoryTable,
	notificationsTable,
	usersTable,
	usersToNotifyTable
} from '../database/schema';
import { db } from '../database/db';

type Notification = typeof notificationsTable.$inferSelect;
type NotificationHistory = typeof notificationHistoryTable.$inferSelect;

async function getNotificationByOwnerAndKeyword(
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

	const [{ notification }] = result;

	const usersToNotify = result.map(({ usersToNotify }) => usersToNotify).filter(Boolean);

	return { notification, usersToNotify };
}

type CreateNotificationHistory = {
	messageID: NotificationHistory['messageID'];
	notificationID: NotificationHistory['notificationID'];
	userID: NotificationHistory['userID'];
};

async function createNotificationHistory({
	messageID,
	notificationID,
	userID
}: CreateNotificationHistory) {
	await db
		.insert(notificationHistoryTable)
		.values({
			id: createId() as NotificationHistory['id'],
			messageID,
			notificationID,
			userID,
			sentAt: new Date()
		})
		.onConflictDoUpdate({
			target: [notificationHistoryTable.notificationID, notificationHistoryTable.userID],
			set: {
				messageID,
				sentAt: new Date()
			}
		})
		.run();
}

async function getNotificationFromHistory(
	messageID: NotificationHistory['messageID'],
	userID: NotificationHistory['userID']
) {
	const ownerHistory = alias(notificationHistoryTable, 'ownerHistory');

	const result = await db
		.select({
			messageToReply: ownerHistory.messageID,
			ownerTelegramId: usersTable.telegramID,
			ownerID: usersTable.id,
			keyword: notificationsTable.keyword
		})
		.from(notificationHistoryTable)
		.innerJoin(
			notificationsTable,
			eq(notificationHistoryTable.notificationID, notificationsTable.id)
		)
		.innerJoin(ownerHistory, eq(notificationsTable.ownerID, ownerHistory.userID))
		.innerJoin(usersTable, eq(notificationsTable.ownerID, usersTable.id))
		.where(
			and(
				eq(notificationHistoryTable.messageID, messageID),
				eq(notificationHistoryTable.userID, userID)
			)
		)
		.get();

	if (!result) {
		return null;
	}

	return result;
}

export {
	getNotificationByOwnerAndKeyword,
	createNotificationHistory,
	getNotificationFromHistory,
	Notification
};
