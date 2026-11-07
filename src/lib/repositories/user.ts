import type { User as TelegramUser } from '@grammyjs/types';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { Context, Data, Effect, Layer, Option } from 'effect';

import { hashString } from '../../common/utils/hash-string.js';
import * as Database from '../database/db.js';
import { apiKeysTable, usersTable } from '../database/schema.js';

export type User = typeof usersTable.$inferSelect;

class UserNotFoundError extends Data.TaggedError('UserNotFoundError') {}

const makeUserRepository = Effect.gen(function* () {
	const db = yield* Database.Database;

	const createUser = Effect.fn('UserRepository.createUser')(function* (
		user: TelegramUser,
	) {
		yield* db.execute((client) =>
			client
				.insert(usersTable)
				.values({
					id: createId() as User['id'],
					telegramID: user.id.toString(),
					firstName: user.first_name,
					lastName: user.last_name,
					username: user.username,
				})
				.onConflictDoUpdate({
					target: usersTable.telegramID,
					set: {
						firstName: user.first_name,
						lastName: user.last_name,
						username: user.username,
					},
				})
				.run(),
		);
	});

	const getUserByTelegramID = db.makeQuery(
		(execute, telegramID: TelegramUser['id']) =>
			execute((client) =>
				client
					.select()
					.from(usersTable)
					.where(eq(usersTable.telegramID, telegramID.toString()))
					.get()
					.then(Option.fromNullishOr),
			).pipe(Effect.withSpan('UserRepository.getUserByTelegramID')),
	);

	const userHasApiKey = db.makeQuery((execute, userID: User['id']) =>
		execute((client) =>
			client
				.select({ id: apiKeysTable.id })
				.from(apiKeysTable)
				.where(eq(apiKeysTable.userID, userID))
				.run()
				.then((apiKeys) => apiKeys.rows.length > 0),
		).pipe(Effect.withSpan('UserRepository.userHasApiKey')),
	);

	const generateApiKeyForUser = Effect.fn(
		'UserRepository.generateApiKeyForUser',
	)(function* (userID: User['id']) {
		const apiKey = createId();
		const hashedApiKey = hashString(apiKey);

		yield* db.execute((client) =>
			client
				.insert(apiKeysTable)
				.values({
					id: createId() as typeof apiKeysTable.$inferSelect.id,
					userID,
					key: hashedApiKey,
					createdAt: new Date(),
				})
				.onConflictDoUpdate({
					target: apiKeysTable.userID,
					set: { key: hashedApiKey, createdAt: new Date() },
				})
				.run(),
		);

		return apiKey;
	});

	const getUserFromApiKey = Effect.fn('UserRepository.getUserFromApiKey')(
		function* (apiKey: string) {
			const result = yield* db.execute((client) =>
				client
					.select({ user: usersTable })
					.from(usersTable)
					.rightJoin(apiKeysTable, eq(apiKeysTable.userID, usersTable.id))
					.where(eq(apiKeysTable.key, hashString(apiKey)))
					.get(),
			);

			return yield* Option.fromNullishOr(result?.user).pipe(
				Option.match({
					onNone: () => Effect.fail(new UserNotFoundError()),
					onSome: Effect.succeed,
				}),
			);
		},
	);

	return {
		createUser,
		getUserByTelegramID,
		userHasApiKey,
		generateApiKeyForUser,
		getUserFromApiKey,
	} as const;
});

export class UserRepository extends Context.Service<
	UserRepository,
	Effect.Success<typeof makeUserRepository>
>()('app/UserRepository') {
	declare readonly createUser: Effect.Success<
		typeof makeUserRepository
	>['createUser'];
	declare readonly getUserByTelegramID: Effect.Success<
		typeof makeUserRepository
	>['getUserByTelegramID'];
	declare readonly userHasApiKey: Effect.Success<
		typeof makeUserRepository
	>['userHasApiKey'];
	declare readonly generateApiKeyForUser: Effect.Success<
		typeof makeUserRepository
	>['generateApiKeyForUser'];
	declare readonly getUserFromApiKey: Effect.Success<
		typeof makeUserRepository
	>['getUserFromApiKey'];

	static readonly layer = Layer.effect(this, makeUserRepository).pipe(
		Layer.provide(Database.layer),
	);
}
