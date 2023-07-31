import type { User as TelegramUser } from '@grammyjs/types';
import { createId } from '@paralleldrive/cuid2';

import { eq, InferModel } from 'drizzle-orm';

import { hashString } from '../common/utils/hash-string';
import { apiKeysTable, usersTable } from '../lib/database/schema';
import { db } from '../lib/database/db';

type User = InferModel<typeof usersTable, 'select'>;

async function createUser(user: TelegramUser) {
	await db
		.insert(usersTable)
		.values({
			id: createId(),
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

async function userHasApiKey(userID: string) {
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
			id: createId(),
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
	const { user } = await db
		.select({ user: usersTable })
		.from(usersTable)
		.rightJoin(apiKeysTable, eq(apiKeysTable.userID, usersTable.id))
		.where(eq(apiKeysTable.key, hashedApiKey))
		.get();

	return user;
}

export {
	createUser,
	getUserByTelegramID,
	generateApiKeyForUser,
	getUserFromApiKey,
	userHasApiKey,
	User
};
