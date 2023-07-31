import { and, eq, InferModel } from 'drizzle-orm';

import { notificationsTable, usersTable, usersToNotifyTable } from '../lib/database/schema';
import { db } from '../lib/database/db';

type Notification = InferModel<typeof notificationsTable, 'select'>;

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

export { getNotificationByOwnerAndKeyword, Notification };
