import { Effect, Layer } from 'effect';
import { Bot } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { TelegramBot } from '../../../src/adapters/telegram/bot.js';
import type { Context } from '../../../src/common/types/context.js';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));

vi.mock('@grammyjs/runner', async (importOriginal) => ({
	...(await importOriginal<typeof import('@grammyjs/runner')>()),
	run: runMock,
}));

const { TelegramPollingLive } =
	await import('../../../src/adapters/telegram/polling.js');

beforeEach(() => vi.resetAllMocks());

describe('TelegramPollingLive', () => {
	it('sets commands, drops pending updates, and stops the runner on scope close', async () => {
		const calls: string[] = [];
		const stop = vi.fn(async () => {
			calls.push('stop');
		});
		const setCommands = vi.fn(async () => {
			calls.push('setCommands');
		});
		const deleteWebhook = vi.fn(async (): Promise<true> => {
			calls.push('deleteWebhook');
			return true;
		});

		runMock.mockImplementation(() => {
			calls.push('run');
			return { stop };
		});

		const bot = new Bot<Context>('123:test');
		vi.spyOn(bot.api, 'deleteWebhook').mockImplementation(deleteWebhook);
		const telegramBot: TelegramBot = {
			bot,
			setCommands,
			checkHealth: async () => undefined,
			setWebhook: async () => true,
		};

		await Effect.runPromise(
			Effect.scoped(
				Layer.build(
					TelegramPollingLive.pipe(
						Layer.provide(Layer.succeed(TelegramBot, telegramBot)),
					),
				),
			),
		);

		expect(deleteWebhook).toHaveBeenCalledWith({ drop_pending_updates: true });
		expect(calls).toEqual(['setCommands', 'deleteWebhook', 'run', 'stop']);
	});

	it.each(['setCommands', 'deleteWebhook'] as const)(
		'does not start polling when %s fails',
		async (stage) => {
			const error = new Error('Telegram unavailable');
			const bot = new Bot<Context>('123:test');
			vi.spyOn(bot.api, 'deleteWebhook').mockImplementation(async () => {
				if (stage === 'deleteWebhook') throw error;
				return true;
			});
			const telegramBot: TelegramBot = {
				bot,
				setCommands: async () => {
					if (stage === 'setCommands') throw error;
				},
				checkHealth: async () => undefined,
				setWebhook: async () => true,
			};
			await expect(
				Effect.runPromise(
					Effect.scoped(
						Layer.build(
							TelegramPollingLive.pipe(
								Layer.provide(Layer.succeed(TelegramBot, telegramBot)),
							),
						),
					),
				),
			).rejects.toMatchObject({ cause: error });
			expect(runMock).not.toHaveBeenCalled();
		},
	);
});
