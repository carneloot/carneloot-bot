import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/runtime.js', () => ({
	runtime: { runPromise: Effect.runPromise },
}));

import { WhatsCommand } from '../../src/commands/whats-command.js';

describe('WhatsCommand', () => {
	it('builds a WhatsApp URL with a normalized Brazilian number and encoded message', async () => {
		const ctx = {
			match: '(11) 91234-5678 Olá, mundo!',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await WhatsCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'https://wa.me/5511912345678?text=Ol%C3%A1%2C%20mundo%21',
		);
	});

	it('explains the required format when no valid phone number is supplied', async () => {
		const ctx = {
			match: 'hello',
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await WhatsCommand.middleware()(ctx as never, vi.fn());

		expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(
			'Envie uma mensagem no formato (00) 0 0000-0000 [mensagem]. A mensagem, os espaços e os algarismos não numéricos são opcionais',
		);
	});
});
