import type { User as TelegramUser } from '@grammyjs/types';
import { createId } from '@paralleldrive/cuid2';

import { eq } from 'drizzle-orm';
import { Data, Effect, Predicate } from 'effect';

import { hashString } from '../../common/utils/hash-string.js';
import { db } from '../database/db.js';
import { apiKeysTable, usersTable } from '../database/schema.js';

import * as Database from '../database/db.js';

export type User = typeof usersTable.$inferSelect;
type ApiKey = typeof apiKeysTable.$inferSelect;

export async function createUser(user: TelegramUser) {
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

export async function getUserByTelegramID(telegramID: TelegramUser['id']) {
	return db
		.select()
		.from(usersTable)
		.where(eq(usersTable.telegramID, telegramID.toString()))
		.get();
}

export async function getUserByID(id: User['id']) {
	return db.select().from(usersTable).where(eq(usersTable.id, id)).get();
}

export async function getUserByUsername(
	username: NonNullable<User['username']>
) {
	return db
		.select()
		.from(usersTable)
		.where(eq(usersTable.username, username))
		.get();
}

export async function userHasApiKey(userID: ApiKey['userID']) {
	const apiKey = await db
		.select({ id: apiKeysTable.id })
		.from(apiKeysTable)
		.where(eq(apiKeysTable.userID, userID))
		.run();

	return apiKey.rows.length > 0;
}

export async function generateApiKeyForUser(userID: User['id']) {
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

class UserNotFoundError extends Data.TaggedError('UserNotFoundError') {}

export const getUserFromApiKey = (apiKey: string) =>
	Effect.gen(function* () {
		const db = yield* Database.Database;
		const hashedApiKey = hashString(apiKey);

		const result = yield* db.execute((client) =>
			client
				.select({ user: usersTable })
				.from(usersTable)
				.rightJoin(apiKeysTable, eq(apiKeysTable.userID, usersTable.id))
				.where(eq(apiKeysTable.key, hashedApiKey))
				.get()
		);

		if (Predicate.isNullable(result?.user)) {
			return yield* new UserNotFoundError();
		}

		return result.user;
	}).pipe(Effect.withSpan('getUserFromApiKey'));
