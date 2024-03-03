import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

type UserID = string & { __userID: true };

export const usersTable = sqliteTable(
	'users',
	{
		id: text('id').primaryKey().$type<UserID>(),
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

type ApiKeyID = string & { __apiKeyID: true };

export const apiKeysTable = sqliteTable(
	'api_keys',
	{
		id: text('id').primaryKey().$type<ApiKeyID>(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>(),
		key: text('key').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		apiKeyIdx: uniqueIndex('apiKeyIdx').on(self.key),
		userIDIdx: uniqueIndex('userIDIdx').on(self.userID)
	})
);

type NotificationID = string & { __notificationID: true };

export const notificationsTable = sqliteTable(
	'notifications',
	{
		id: text('id').primaryKey().$type<NotificationID>(),
		keyword: text('keyword').notNull(),
		message: text('message').notNull(),
		ownerID: text('owner_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>()
	},
	(self) => ({
		keywordIdx: uniqueIndex('keywordIdx').on(self.keyword, self.ownerID)
	})
);

type UsersToNotifyID = string & { __usersToNotifyID: true };

export const usersToNotifyTable = sqliteTable(
	'users_to_notify',
	{
		id: text('id').primaryKey().$type<UsersToNotifyID>(),
		notificationID: text('notification_id')
			.notNull()
			.references(() => notificationsTable.id)
			.$type<NotificationID>(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>()
	},
	(self) => ({
		uniqueIdx: uniqueIndex('uniqueIdx').on(self.notificationID, self.userID)
	})
);

type NotificationHistoryID = string & { __notificationHistoryID: true };

export const notificationHistoryTable = sqliteTable(
	'notification_history',
	{
		id: text('id').primaryKey().$type<NotificationHistoryID>(),
		notificationID: text('notification_id')
			.notNull()
			.references(() => notificationsTable.id)
			.$type<NotificationID>(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>(),
		messageID: integer('message_id').notNull(),
		sentAt: integer('sent_at', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		messageIdIdx: uniqueIndex('messageIdIdx').on(self.messageID),
		uniqueIndex: uniqueIndex('uniqueIndex').on(self.notificationID, self.userID)
	})
);
