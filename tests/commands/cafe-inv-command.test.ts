import { afterEach, describe, expect, it, vi } from 'vitest';

import { CafeInvCommand } from '../../src/commands/cafe-inv-command.js';

describe('CafeInvCommand', () => {
	afterEach(() => vi.restoreAllMocks());

	it('calculates the water and pour schedule for a coffee amount', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.6);
		const ctx = {
			match: '30g',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await CafeInvCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenNthCalledWith(1, 'Quantidade de água: 500 ml');
		expect(ctx.reply).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining('Até 500 g'),
			{ parse_mode: 'HTML' },
		);
	});

	it('asks for a coffee amount when the input is missing or incompatible', async () => {
		const ctx = {
			match: '500ml',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await CafeInvCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Me envie a quantidade de café em g. 😄',
		);
	});
});
