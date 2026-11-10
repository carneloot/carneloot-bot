import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createUser: vi.fn(),
}));

vi.mock('../../../src/lib/entities/user.js', () => ({
	createUser: mocks.createUser,
}));

import { SignupCommand } from '../../../src/modules/auth/signup.command.js';

describe('SignupCommand', () => {
	beforeEach(() => mocks.createUser.mockReset());

	it('persists the Telegram user and confirms signup', async () => {
		const from = { id: 123, first_name: 'Ada', is_bot: false };
		const ctx = {
			from,
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await SignupCommand(ctx as never, vi.fn());

		expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith(from);
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Usuário cadastrado com sucesso!',
		);
	});

	it('rejects signup when Telegram does not provide a user', async () => {
		const ctx = {
			from: undefined,
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await SignupCommand(ctx as never, vi.fn());

		expect(mocks.createUser).not.toHaveBeenCalled();
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Não foi possível identificar o usuário.',
		);
	});
});
