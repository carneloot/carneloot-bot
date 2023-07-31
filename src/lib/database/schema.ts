import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const usersTable = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		telegramID: text('telegram_id').notNull(),
		username: text('username'),
		firstName: text('first_name').notNull(),
		lastName: text('last_name')
	},
	(self) => ({
		telegramIDIdx: uniqueIndex('telegramIDIdx').on(self.telegramID),
		usernameIdx: uniqueIndex('usernameIdx').on(self.username)
	})
);

export const apiKeysTable = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id),
		key: text('key').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		apiKeyIdx: uniqueIndex('apiKeyIdx').on(self.key),
		userIDIdx: uniqueIndex('userIDIdx').on(self.userID)
	})
);

export const notificationsTable = sqliteTable(
	'notifications',
	{
		id: text('id').primaryKey(),
		keyword: text('keyword').notNull(),
		message: text('message').notNull(),
		ownerID: text('owner_id')
			.notNull()
			.references(() => usersTable.id)
	},
	(self) => ({
		keywordIdx: uniqueIndex('keywordIdx').on(self.keyword, self.ownerID)
	})
);

export const usersToNotifyTable = sqliteTable(
	'users_to_notify',
	{
		id: text('id').primaryKey(),
		notificationID: text('notification_id')
			.notNull()
			.references(() => notificationsTable.id),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
	},
	(self) => ({
		uniqueIdx: uniqueIndex('uniqueIdx').on(self.notificationID, self.userID)
	})
);

export const notificationHistoryTable = sqliteTable(
	'notification_history',
	{
		id: text('id').primaryKey(),
		notificationID: text('notification_id')
			.notNull()
			.references(() => notificationsTable.id),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id),
		messageID: integer('message_id').notNull(),
		sentAt: integer('sent_at', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		messageIdIdx: uniqueIndex('messageIdIdx').on(self.messageID),
		uniqueIndex: uniqueIndex('uniqueIndex').on(self.notificationID, self.userID)
	})
);
