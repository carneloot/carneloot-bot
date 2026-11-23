import debug from 'debug';
import { Effect, Logger, References } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { AppServices } from '../../app/layer.js';
import type { Execute } from '../execute.js';
import { installGrammyDebugLogger } from './debug.js';

describe('installGrammyDebugLogger', () => {
	it('routes grammY namespaces through Effect while preserving other debug sinks', async () => {
		const logs: Array<ReturnType<typeof Logger.formatStructured.log>> = [];
		const logger = Logger.map(Logger.formatStructured, (log) => {
			logs.push(log);
		});
		const execute = ((effect: Effect.Effect<unknown>) =>
			Effect.runPromise(
				effect.pipe(
					Effect.provide(Logger.layer([logger])),
					Effect.provideService(References.MinimumLogLevel, 'Debug'),
				),
			)) as Execute<AppServices>;
		const originalSink = vi.fn();
		const previousNamespaces = debug.disable();
		debug.enable('grammy*,other');
		debug.log = originalSink;
		const restore = installGrammyDebugLogger(execute);

		try {
			debug('grammy:core')('Calling getMe');
			debug('other')('Keep this sink');

			await vi.waitFor(() => expect(logs).toHaveLength(1));
			expect(logs[0]).toMatchObject({
				annotations: { 'debug.namespace': 'grammy:core' },
				level: 'DEBUG',
				message: 'Calling getMe',
			});
			expect(originalSink).toHaveBeenCalledOnce();
		} finally {
			restore();
			debug.enable(previousNamespaces);
		}
	});
});
