import { Effect, Option } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import type { Execute } from '../adapters/execute.js';
import type { Context } from '../common/types/context.js';
import { UserRepository, type User } from '../lib/repositories/user.js';
import { createUserMiddleware } from './user.middleware.js';

const user = {
	id: 'user-id' as User['id'],
	telegramID: '123',
	firstName: 'Matheus',
	lastName: null,
	username: 'carneloot',
} satisfies User;

const createExecute = (
	getUserByTelegramID: UserRepository['getUserByTelegramID'],
): Execute<UserRepository> => {
	const users = UserRepository.of({
		createUser: () => Effect.void,
		getUserByTelegramID,
		userHasApiKey: () => Effect.succeed(false),
		generateApiKeyForUser: () => Effect.succeed('api-key'),
		getUserFromApiKey: () => Effect.die('not used'),
	});

	return (effect) =>
		Effect.runPromise(
			effect.pipe(Effect.provideService(UserRepository, users)),
		);
};

describe('createUserMiddleware', () => {
	it('loads the user through Execute and assigns ctx.user before next', async () => {
		const getUserByTelegramID = vi.fn(() => Effect.succeed(Option.some(user)));
		const middleware = createUserMiddleware(createExecute(getUserByTelegramID));
		const context = { from: { id: 123 } } as Context;
		const next = vi.fn(async () => {
			expect(context.user).toEqual(user);
		});

		await middleware(context, next);

		expect(getUserByTelegramID).toHaveBeenCalledWith(123);
		expect(next).toHaveBeenCalledOnce();
	});

	it('leaves ctx.user unset when no registered user exists', async () => {
		const middleware = createUserMiddleware(
			createExecute(() => Effect.succeed(Option.none())),
		);
		const context = { from: { id: 123 } } as Context;
		const next = vi.fn();

		await middleware(context, next);

		expect(context.user).toBeUndefined();
		expect(next).toHaveBeenCalledOnce();
	});
});
