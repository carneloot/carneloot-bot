import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/runtime.js', () => ({
	runtime: { runPromise: Effect.runPromise },
}));

import { PingCommand } from '../../src/commands/ping.command.js';

describe('PingCommand', () => {
	it('replies with the requested valid delay and references the command message', async () => {
		const ctx = {
			match: '0',
			message: { message_id: 42 },
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await PingCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith('pong 0', {
			reply_parameters: { message_id: 42 },
		});
	});

	it('uses a zero-duration pong when the delay is invalid', async () => {
		const ctx = {
			match: 'not-a-duration',
			message: { message_id: 42 },
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await PingCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith('pong 0', {
			reply_parameters: { message_id: 42 },
		});
	});
});
