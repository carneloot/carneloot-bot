import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	generateApiKeyForUser: vi.fn(),
	userHasApiKey: vi.fn(),
}));

vi.mock('../../../src/lib/entities/user.js', () => ({
	generateApiKeyForUser: mocks.generateApiKeyForUser,
	userHasApiKey: mocks.userHasApiKey,
}));

import { GenerateApiKeyCommand } from '../../../src/modules/auth/generate-api-key.command.js';

describe('GenerateApiKeyCommand', () => {
	beforeEach(() => {
		mocks.generateApiKeyForUser.mockReset();
		mocks.userHasApiKey.mockReset();
	});

	it('generates and sends an API key when the authenticated user has none', async () => {
		mocks.userHasApiKey.mockResolvedValue(false);
		mocks.generateApiKeyForUser.mockResolvedValue('new-api-key');
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'user-1' },
		};

		await GenerateApiKeyCommand(ctx as never);

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
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: undefined,
		};

		await GenerateApiKeyCommand(ctx as never);

		expect(mocks.userHasApiKey).not.toHaveBeenCalled();
		expect(mocks.generateApiKeyForUser).not.toHaveBeenCalled();
		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Por favor cadastre-se primeiro utilizando /cadastrar',
		);
	});
});
