import { Effect, Layer, Logger, ManagedRuntime } from 'effect';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { TelemetryLive } from '../../src/app/telemetry.js';

const config = vi.hoisted(() => ({ url: undefined as string | undefined }));

vi.mock('../../src/common/env.js', async () => {
	const { Redacted } = await import('effect');
	return {
		Env: {
			get OTLP_URL() {
				return config.url;
			},
			OTLP_API_TOKEN: Redacted.make('test-ingest-key'),
			SOURCE_COMMIT: 'abcdef123456',
		},
	};
});

describe('telemetry', () => {
	it.each(['', '/v1/traces'])(
		'exports correlated logs and traces from an OTLP URL ending in "%s"',
		async (path) => {
			const requests: Array<{
				path: string | undefined;
				authorization: string | undefined;
				body: unknown;
			}> = [];
			const server = createServer(async (request, response) => {
				let body = '';
				for await (const chunk of request) body += chunk.toString();
				requests.push({
					path: request.url,
					authorization: request.headers.authorization,
					body: JSON.parse(body),
				});
				response.setHeader('Content-Type', 'application/json');
				response.end('{}');
			});
			await new Promise<void>((resolve) =>
				server.listen(0, '127.0.0.1', resolve),
			);
			const address = server.address();
			if (address === null || typeof address === 'string') {
				throw new Error('Expected an HTTP listener');
			}
			config.url = `http://127.0.0.1:${address.port}${path}`;
			const localLogs: unknown[] = [];
			const localLogger = Logger.map(Logger.formatStructured, (log) => {
				localLogs.push(log);
			});
			const runtime = ManagedRuntime.make(
				Layer.effectDiscard(
					Effect.acquireRelease(Effect.logInfo('Service starting'), () =>
						Effect.logInfo('Service stopped'),
					),
				).pipe(
					Layer.provideMerge(TelemetryLive),
					Layer.provide(Logger.layer([localLogger])),
				),
			);

			try {
				const span = await runtime.runPromise(
					Effect.gen(function* () {
						yield* Effect.logWarning('Notification retry').pipe(
							Effect.annotateLogs({ 'notification.id': 'notification-42' }),
						);
						return yield* Effect.currentSpan;
					}).pipe(Effect.withSpan('notification.send')),
				);
				await runtime.dispose();

				expect(requests).toHaveLength(2);
				const logs = requests.find((request) => request.path === '/v1/logs');
				const traces = requests.find(
					(request) => request.path === '/v1/traces',
				);
				expect(logs?.authorization).toBe('Bearer test-ingest-key');
				expect(traces?.authorization).toBe('Bearer test-ingest-key');
				expect(logs?.body).toMatchObject({
					resourceLogs: [
						{
							resource: {
								attributes: expect.arrayContaining([
									{
										key: 'service.name',
										value: { stringValue: 'carneloot-bot' },
									},
									{ key: 'service.version', value: { stringValue: 'abcdef' } },
								]),
							},
							scopeLogs: [
								{
									logRecords: [
										{ body: { stringValue: 'Service starting' } },
										{
											body: { stringValue: 'Notification retry' },
											severityNumber: 13,
											traceId: span.traceId,
											spanId: span.spanId,
											attributes: expect.arrayContaining([
												{
													key: 'notification.id',
													value: { stringValue: 'notification-42' },
												},
											]),
										},
										{ body: { stringValue: 'Service stopped' } },
									],
								},
							],
						},
					],
				});
				expect(traces?.body).toMatchObject({
					resourceSpans: [
						{
							scopeSpans: [
								{
									spans: [
										{
											name: 'notification.send',
											traceId: span.traceId,
											spanId: span.spanId,
										},
									],
								},
							],
						},
					],
				});
				expect(localLogs).toMatchObject([
					{ level: 'INFO', message: 'Service starting' },
					{ level: 'WARN', message: 'Notification retry' },
					{ level: 'INFO', message: 'Service stopped' },
				]);
			} finally {
				await runtime.dispose();
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
				config.url = undefined;
			}
		},
	);
});
