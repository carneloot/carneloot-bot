import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { TelegramBot } from './bot.js';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));

vi.mock('@grammyjs/runner', () => ({ run: runMock }));

const { startPolling } = await import('./polling.js');

describe('startPolling', () => {
	it('sets commands, drops pending updates, and stops the runner on scope close', async () => {
		const calls: string[] = [];
		const stop = vi.fn(async () => {
			calls.push('stop');
		});
		const setCommands = vi.fn(async () => {
			calls.push('setCommands');
		});
		const deleteWebhook = vi.fn(async () => {
			calls.push('deleteWebhook');
		});

		runMock.mockImplementation(() => {
			calls.push('run');
			return { stop };
		});

		const telegramBot = {
			bot: { api: { deleteWebhook } },
			setCommands,
		} as unknown as TelegramBot;

		await Effect.runPromise(Effect.scoped(startPolling(telegramBot)));

		expect(deleteWebhook).toHaveBeenCalledWith({ drop_pending_updates: true });
		expect(calls).toEqual(['setCommands', 'deleteWebhook', 'run', 'stop']);
	});
});
