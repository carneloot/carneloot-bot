import { db } from './database/db';
import { notificationHistoryTable } from './database/schema';
import { createId } from '@paralleldrive/cuid2';

type CreateNotificationHistory = {
	messageID: number;
	notificationID: string;
	userID: string;
};

async function createNotificationHistory({
	messageID,
	notificationID,
	userID
}: CreateNotificationHistory) {
	await db
		.insert(notificationHistoryTable)
		.values({
			id: createId(),
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

export { createNotificationHistory };
