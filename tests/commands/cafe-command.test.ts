import { afterEach, describe, expect, it, vi } from 'vitest';

import { CafeCommand } from '../../src/commands/cafe-command.js';

describe('CafeCommand', () => {
	afterEach(() => vi.restoreAllMocks());

	it('calculates the coffee and pour schedule for a water amount', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.6);
		const ctx = {
			match: '500ml',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await CafeCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenNthCalledWith(1, 'Quantidade de café: 30 g');
		expect(ctx.reply).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining('Até 500 g'),
			{ parse_mode: 'HTML' },
		);
	});

	it('asks for a water amount when the input is missing or incompatible', async () => {
		const ctx = {
			match: '20g',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await CafeCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Me envie a quantidade inicial de água em ml. 😄',
		);
	});
});
