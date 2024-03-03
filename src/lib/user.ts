import type { User as TelegramUser } from '@grammyjs/types';
import { createId } from '@paralleldrive/cuid2';

import { eq } from 'drizzle-orm';

import { hashString } from '../common/utils/hash-string';
import { apiKeysTable, usersTable } from './database/schema';
import { db } from './database/db';

type User = typeof usersTable.$inferSelect;
type ApiKey = typeof apiKeysTable.$inferSelect;

async function createUser(user: TelegramUser) {
	await db
		.insert(usersTable)
		.values({
			id: createId() as User['id'],
			telegramID: user.id.toString(),
			firstName: user.first_name,
			lastName: user.last_name,
			username: user.username
		})
		.onConflictDoUpdate({
			target: usersTable.telegramID,
			set: {
				firstName: user.first_name,
				lastName: user.last_name,
				username: user.username
			}
		})
		.run();
}

async function getUserByTelegramID(telegramID: TelegramUser['id']) {
	return db
		.select()
		.from(usersTable)
		.where(eq(usersTable.telegramID, telegramID.toString()))
		.get();
}

async function userHasApiKey(userID: ApiKey['userID']) {
	const apiKey = await db
		.select({ id: apiKeysTable.id })
		.from(apiKeysTable)
		.where(eq(apiKeysTable.userID, userID))
		.run();

	return apiKey.rows.length > 0;
}

async function generateApiKeyForUser(userID: User['id']) {
	const apiKey = createId();
	const hashedApiKey = hashString(apiKey);

	await db
		.insert(apiKeysTable)
		.values({
			id: createId() as ApiKey['id'],
			userID,
			key: hashedApiKey,
			createdAt: new Date()
		})
		.onConflictDoUpdate({
			target: apiKeysTable.userID,
			set: {
				key: hashedApiKey,
				createdAt: new Date()
			}
		})
		.run();

	return apiKey;
}

async function getUserFromApiKey(apiKey: string) {
	const hashedApiKey = hashString(apiKey);
	const result = await db
		.select({ user: usersTable })
		.from(usersTable)
		.rightJoin(apiKeysTable, eq(apiKeysTable.userID, usersTable.id))
		.where(eq(apiKeysTable.key, hashedApiKey))
		.get();

	return result?.user ?? null;
}

export {
	createUser,
	getUserByTelegramID,
	generateApiKeyForUser,
	getUserFromApiKey,
	userHasApiKey,
	User
};
