import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import type { Execute } from '../execute.js';
import { conversationExternal } from './conversation-external.js';

describe('conversationExternal', () => {
	it('executes an Effect once and revives its Schema-safe result during replay', async () => {
		let stored: unknown;
		let replay = false;
		let calls = 0;
		const conversation = {
			external: async (operation: {
				task: (context: unknown) => Promise<{ count: number }>;
				beforeStore: (value: { count: number }) => Promise<unknown>;
				afterLoad: (value: unknown) => Promise<{ count: number }>;
			}) => {
				if (replay) return operation.afterLoad(stored);
				const result = await operation.task({});
				stored = await operation.beforeStore(result);
				return result;
			},
		};
		const execute: Execute<never> = (effect) => Effect.runPromise(effect);
		const operation = () => Effect.sync(() => ({ count: ++calls }));

		expect(
			await conversationExternal(
				conversation as never,
				execute,
				Schema.Struct({ count: Schema.Number }),
				operation,
			),
		).toEqual({ count: 1 });

		replay = true;
		expect(
			await conversationExternal(
				conversation as never,
				execute,
				Schema.Struct({ count: Schema.Number }),
				operation,
			),
		).toEqual({ count: 1 });
		expect(calls).toBe(1);
	});

	it('rejects invalid persisted results rather than returning unvalidated data', async () => {
		const conversation = {
			external: (operation: {
				afterLoad: (value: unknown) => Promise<unknown>;
			}) => operation.afterLoad({ count: 'wrong' }),
		};
		const execute: Execute<never> = (effect) => Effect.runPromise(effect);

		await expect(
			conversationExternal(
				conversation as never,
				execute,
				Schema.Struct({ count: Schema.Number }),
				() => Effect.succeed({ count: 1 }),
			),
		).rejects.toThrow();
	});
});
