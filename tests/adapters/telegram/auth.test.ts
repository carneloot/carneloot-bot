import { Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Execute } from '../../../src/adapters/execute.js';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

const mocks = vi.hoisted(() => ({
	createUser: vi.fn(),
	generateApiKeyForUser: vi.fn(),
	userHasApiKey: vi.fn(),
}));

import {
	createApiKeyConfirmationMenu,
	createGenerateApiKeyCommand,
	createSignupCommand,
} from '../../../src/adapters/telegram/auth.js';
import { UserRepository } from '../../../src/lib/repositories/user.js';

const users = Layer.mock(UserRepository, mocks);
const execute: Execute<UserRepository> = (effect) =>
	Effect.runPromise(effect.pipe(Effect.provide(users)));
const menu = createApiKeyConfirmationMenu(execute);
const signup = createSignupCommand(execute);
const generateKey = createGenerateApiKeyCommand(execute, menu);

describe('authentication command regressions', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.createUser.mockReturnValue(Effect.void);
		mocks.userHasApiKey.mockReturnValue(Effect.succeed(false));
		mocks.generateApiKeyForUser.mockReturnValue(Effect.succeed('new-api-key'));
	});

	it('persists the Telegram user and confirms signup', async () => {
		const from = { id: 123, first_name: 'Ada', is_bot: false };
		const ctx = { from, reply: vi.fn().mockResolvedValue(undefined) };
		await signup(ctx as never, vi.fn());
		expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith(from);
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Usuário cadastrado com sucesso!',
		);
	});

	it('rejects signup when Telegram does not provide a user', async () => {
		const ctx = { reply: vi.fn().mockResolvedValue(undefined) };
		await signup(ctx as never, vi.fn());
		expect(mocks.createUser).not.toHaveBeenCalled();
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Não foi possível identificar o usuário.',
		);
	});

	it('generates and sends an API key when the authenticated user has none', async () => {
		const ctx = {
			user: { id: 'user-1' },
			reply: vi.fn().mockResolvedValue(undefined),
		};
		await generateKey(ctx as never, vi.fn());
		expect(mocks.userHasApiKey).toHaveBeenCalledExactlyOnceWith('user-1');
		expect(mocks.generateApiKeyForUser).toHaveBeenCalledExactlyOnceWith(
			'user-1',
		);
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Aqui está: <pre>new-api-key</pre>',
			{ parse_mode: 'HTML' },
		);
	});

	it('asks unauthenticated users to sign up without accessing persistence', async () => {
		const ctx = { reply: vi.fn().mockResolvedValue(undefined) };
		await generateKey(ctx as never, vi.fn());
		expect(mocks.userHasApiKey).not.toHaveBeenCalled();
		expect(mocks.generateApiKeyForUser).not.toHaveBeenCalled();
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Por favor cadastre-se primeiro utilizando /cadastrar',
		);
	});
});
