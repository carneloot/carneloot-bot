import debug from 'debug';
import { Effect, Logger } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { Execute } from '../../../src/adapters/execute.js';
import { installGrammyDebugLogger } from '../../../src/adapters/telegram/debug.js';
import type { AppServices } from '../../../src/app/layer.js';

describe('installGrammyDebugLogger', () => {
	it('maps enabled grammY namespaces to severity levels while preserving debug filtering and other sinks', async () => {
		const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = [];
		const logger = Logger.map(Logger.formatStructured, (log) => {
			logs.push(log);
		});
		const execute = ((effect: Effect.Effect<unknown>) =>
			Effect.runPromise(
				effect.pipe(Effect.provide(Logger.layer([logger]))),
			)) as Execute<AppServices>;
		const originalSink = vi.fn();
		const previousNamespaces = debug.disable();
		const previousSink = debug.log;
		debug.enable('grammy*,other,-grammy:excluded');
		debug.log = originalSink;
		const restore = installGrammyDebugLogger(execute);

		try {
			debug('grammy:core')('Calling getMe');
			debug('grammy:warn')('Missing allowed update type');
			debug('grammy:error')('Request timed out');
			debug('grammy:excluded')('Do not log this');
			debug.enable('other');
			debug('grammy:warn')('Disabled warning');
			debug('grammy:error')('Disabled error');
			debug('other')('Keep this sink');
			await execute(Effect.logDebug('Unrelated debug log stays filtered'));

			await vi.waitFor(() => expect(logs).toHaveLength(3));
			expect(logs).toMatchObject([
				{
					annotations: { 'debug.namespace': 'grammy:core' },
					level: 'INFO',
					message: 'Calling getMe',
				},
				{
					annotations: { 'debug.namespace': 'grammy:warn' },
					level: 'WARN',
					message: 'Missing allowed update type',
				},
				{
					annotations: { 'debug.namespace': 'grammy:error' },
					level: 'ERROR',
					message: 'Request timed out',
				},
			]);
			expect(originalSink).toHaveBeenCalledOnce();
		} finally {
			restore();
			debug.log = previousSink;
			debug.enable(previousNamespaces);
		}
	});
});
