import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const UserID = z.string().cuid2().brand('UserID');
export type UserID = z.infer<typeof UserID>;

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

export const PetID = z.string().cuid2().brand('PetID');
export type PetID = z.infer<typeof PetID>;

export const petsTable = sqliteTable(
	'pets',
	{
		id: text('id').primaryKey().$type<PetID>(),
		name: text('name').notNull(),
		ownerID: text('owner_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>()
	},
	(self) => ({
		petNameIdx: uniqueIndex('petNameIdx').on(self.name, self.ownerID),
		petOwnerIdx: index('petOwnerIdx').on(self.ownerID)
	})
);

export const PetCarerStatus = z.enum(['pending', 'accepted', 'rejected']);
export type PetCarerStatus = z.infer<typeof PetCarerStatus>;

export const PetCarerID = z.string().cuid2().brand('PetCarerID');
export type PetCarerID = z.infer<typeof PetCarerID>;

export const petCarersTable = sqliteTable(
	'pet_carers',
	{
		id: text('id').primaryKey().$type<PetCarerID>(),
		petID: text('pet_id')
			.notNull()
			.references(() => petsTable.id)
			.$type<PetID>(),
		carerID: text('carer_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>(),
		status: text('status').$type<PetCarerStatus>().notNull().default('pending')
	},
	(self) => ({
		petCarerIdx: uniqueIndex('petCarerIdx').on(self.petID, self.carerID),
		petIdIdx: index('petIdIdx').on(self.petID),
		carerIdIdx: index('carerIdIdx').on(self.carerID)
	})
);

export const PetFoodID = z.string().cuid2().brand('PetFoodID');
export type PetFoodID = z.infer<typeof PetFoodID>;

export const petFoodTable = sqliteTable(
	'pet_food',
	{
		id: text('id').primaryKey().$type<PetFoodID>(),
		petID: text('pet_id')
			.notNull()
			.references(() => petsTable.id)
			.$type<PetID>(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>(),
		messageID: integer('message_id'),
		quantity: real('quantity').notNull(),
		time: integer('time', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		petFoodPetIdIdx: index('petFoodPetIdIdx').on(self.petID),
		petFoodUserIDIdx: index('petFoodUserIDIdx').on(self.userID),
		petFoodCreatedAtIdx: index('petFoodCreatedAtIdx').on(self.time),
		petFoodMessageIDIdx: index('petFoodMessageIDIdx').on(self.messageID)
	})
);

export const ConfigID = z.string().cuid2().brand('ConfigID');
export type ConfigID = z.infer<typeof ConfigID>;

export const configsTable = sqliteTable(
	'configs',
	{
		id: text('id').primaryKey().$type<ConfigID>(),
		context: text('context').notNull(),
		key: text('key'),
		value: blob('value', { mode: 'json' }).notNull()
	},
	(self) => ({
		configUniqIdx: uniqueIndex('configUniqIdx').on(self.context, self.key)
	})
);

export const ApiKeyID = z.string().cuid2().brand('ApiKeyID');
export type ApiKeyID = z.infer<typeof ApiKeyID>;

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

export const NotificationID = z.string().cuid2().brand('NotificationID');
export type NotificationID = z.infer<typeof NotificationID>;

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

export const UsersToNotifyID = z.string().cuid2().brand('UsersToNotifyID');
export type UsersToNotifyID = z.infer<typeof UsersToNotifyID>;

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

export const NotificationHistoryID = z.string().cuid2().brand('NotificationHistoryID');
export type NotificationHistoryID = z.infer<typeof NotificationHistoryID>;

export const notificationHistoryTable = sqliteTable(
	'notification_history',
	{
		id: text('id').primaryKey().$type<NotificationHistoryID>(),
		notificationID: text('notification_id')
			.references(() => notificationsTable.id)
			.$type<NotificationID>(),
		petID: text('pet_id')
			.references(() => petsTable.id)
			.$type<PetID>(),
		userID: text('user_id')
			.notNull()
			.references(() => usersTable.id)
			.$type<UserID>(),
		messageID: integer('message_id').notNull(),
		sentAt: integer('sent_at', { mode: 'timestamp' }).notNull()
	},
	(self) => ({
		messageIdIdx: uniqueIndex('messageIdIdx').on(self.messageID),
		notificationHistoryUniqNotifIdx: uniqueIndex('notificationHistoryUniqNotifIdx').on(
			self.notificationID,
			self.userID
		),
		notificationHistoryUniqPetIdx: uniqueIndex('notificationHistoryUniqPetIdx').on(
			self.petID,
			self.userID
		)
	})
);

export const sessionsTable = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		context: text('context').notNull(),
		key: text('key').notNull(),
		value: blob('value', { mode: 'json' }).notNull()
	},
	(self) => ({
		sessionIdx: uniqueIndex('sessionIdx').on(self.context, self.key)
	})
);
