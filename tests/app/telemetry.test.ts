import * as OtelTracer from '@effect/opentelemetry/OtelTracer';
import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import { context, createContextKey } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { AbortController as GrammyAbortController } from 'abort-controller';
import {
	Deferred,
	Effect,
	Layer,
	Logger,
	ManagedRuntime,
	Option,
	Schema,
} from 'effect';
import { Api, GrammyError, HttpError } from 'grammy';
import { createServer } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';

import type { Execute } from '../../src/adapters/execute.js';
import { createBot } from '../../src/adapters/telegram/bot.js';
import { createTelegramApiTracing } from '../../src/adapters/telegram/tracing.js';
import type { AppServices } from '../../src/app/layer.js';
import { TelemetryLive } from '../../src/app/telemetry.js';
import type { UserID } from '../../src/lib/database/schema.js';
import { PetRepository } from '../../src/lib/repositories/pet.js';
import { UserRepository } from '../../src/lib/repositories/user.js';
import { createGrammyRunner } from '../support/grammy-runner.js';

const config = vi.hoisted(() => ({ url: undefined as string | undefined }));

vi.mock('../../src/common/env.js', async () => {
	const { Redacted } = await import('effect');
	return {
		Env: {
			BOT_TOKEN: Redacted.make('test-token'),
			REDIS_URL: 'redis://localhost:6379',
			DATABASE_URL: 'file::memory:',
			get OTLP_URL() {
				return config.url;
			},
			OTLP_API_TOKEN: Redacted.make('test-ingest-key'),
			SOURCE_COMMIT: 'abcdef123456',
		},
	};
});

const startCollector = async () => {
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
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Expected an HTTP listener');
	}
	return {
		requests,
		url: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
};

describe('telemetry', () => {
	it.each([false, true])(
		'shares async context across scopes and preserves external ownership: %s',
		async (external) => {
			const manager = external
				? new AsyncLocalStorageContextManager().enable()
				: undefined;
			if (manager) expect(context.setGlobalContextManager(manager)).toBe(true);
			const first = ManagedRuntime.make(TelemetryLive);
			const second = ManagedRuntime.make(TelemetryLive);
			const key = createContextKey('telemetry-lifecycle-test');
			const readAfterAwait = () =>
				context.with(context.active().setValue(key, 'present'), async () => {
					await setImmediate();
					return context.active().getValue(key);
				});
			try {
				await first.runPromise(Effect.void);
				await second.runPromise(Effect.void);
				expect(await readAfterAwait()).toBe('present');
				await first.dispose();
				expect(await readAfterAwait()).toBe('present');
				await second.dispose();
				expect(await readAfterAwait()).toBe(external ? 'present' : undefined);
			} finally {
				await first.dispose();
				await second.dispose();
				if (manager) context.disable();
			}
		},
	);

	it('traces API outcomes under the closest concurrent Effect parent without leaking private data', async () => {
		const collector = await startCollector();
		config.url = collector.url;
		const runtime = ManagedRuntime.make(TelemetryLive);
		const networkError = new Error('sensitive-network-error');
		const aborted = new DOMException('sensitive-cancellation', 'AbortError');
		const api = new Api('sensitive-bot-token', {
			fetch: async (url: string | URL | Request, init?: RequestInit) => {
				await setImmediate();
				if (init?.signal?.aborted) throw aborted;
				if (String(url).endsWith('/getUpdates'))
					return new Response(JSON.stringify({ ok: true, result: [] }));
				const payload = JSON.parse(String(init?.body)) as { text: string };
				if (payload.text === 'sensitive-network') throw networkError;
				return new Response(
					JSON.stringify(
						payload.text === 'sensitive-rejected'
							? {
									ok: false,
									error_code: 403,
									description: 'sensitive-description',
								}
							: { ok: true, result: { message_id: 42 } },
					),
				);
			},
		});
		try {
			api.config.use(
				createTelegramApiTracing(
					await runtime.runPromise(OtelTracer.OtelTracer),
				),
			);
			const parents = await runtime.runPromise(
				Effect.forEach(
					['success', 'rejected', 'network', 'aborted'],
					(outcome) =>
						Effect.gen(function* () {
							const parent = yield* Effect.currentSpan;
							yield* Effect.yieldNow;
							yield* Effect.promise(async () => {
								await setImmediate();
								const controller = new GrammyAbortController();
								if (outcome === 'aborted') controller.abort();
								const request = api.sendMessage(
									1,
									`sensitive-${outcome}`,
									{},
									controller.signal,
								);
								if (outcome === 'success')
									await expect(request).resolves.toEqual({ message_id: 42 });
								else if (outcome === 'rejected')
									await expect(request).rejects.toBeInstanceOf(GrammyError);
								else {
									const error = await request.catch((error: unknown) => error);
									expect(error).toBeInstanceOf(HttpError);
									if (error instanceof HttpError)
										expect(error.error).toBe(
											outcome === 'network' ? networkError : aborted,
										);
								}
							});
							return { outcome, spanId: parent.spanId };
						}).pipe(
							Effect.withSpan(`nested.${outcome}`),
							Effect.withSpan(`request.${outcome}`, { root: true }),
						),
					{ concurrency: 'unbounded' },
				),
			);
			await api.sendMessage(1, 'sensitive-outside');
			await expect(api.getUpdates({ timeout: 30 })).resolves.toEqual([]);
			await runtime.dispose();
			const body = collector.requests.find(
				(request) => request.path === '/v1/traces',
			)?.body;
			const payload = Schema.decodeUnknownSync(
				Schema.Struct({
					resourceSpans: Schema.Array(
						Schema.Struct({
							scopeSpans: Schema.Array(
								Schema.Struct({
									spans: Schema.Array(
										Schema.Struct({
											name: Schema.String,
											parentSpanId: Schema.optional(Schema.String),
											status: Schema.Struct({
												code: Schema.optional(Schema.Number),
											}),
										}),
									),
								}),
							),
						}),
					),
				}),
			)(body);
			const spans = payload.resourceSpans.flatMap((resource) =>
				resource.scopeSpans.flatMap((scope) => scope.spans),
			);
			expect(
				spans.some((span) => span.name === 'telegram.api.getUpdates'),
			).toBe(false);
			const apiSpans = spans.filter(
				(span) => span.name === 'telegram.api.sendMessage',
			);
			expect(apiSpans).toHaveLength(5);
			for (const parent of parents) {
				const children = apiSpans.filter(
					(span) => span.parentSpanId === parent.spanId,
				);
				expect(children).toHaveLength(1);
				expect(children[0]?.status.code ?? 0).toBe(
					parent.outcome === 'success' ? 0 : 2,
				);
			}
			expect(apiSpans.filter((span) => !span.parentSpanId)).toHaveLength(1);
			expect(JSON.stringify(body)).not.toContain('sensitive-');
		} finally {
			await runtime.dispose();
			await collector.close();
			config.url = undefined;
		}
	});

	it.each(['', '/v1/traces'])(
		'exports correlated logs and traces from an OTLP URL ending in "%s"',
		async (path) => {
			const collector = await startCollector();
			const { requests } = collector;
			config.url = `${collector.url}${path}`;
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
				await collector.close();
				config.url = undefined;
			}
		},
	);

	it('groups update traces and correlates conversation runs across saved-state replay', async () => {
		const collector = await startCollector();
		config.url = collector.url;
		const bothChatsStarted = Deferred.makeUnsafe<void>();
		const chats = new Set<number>();
		const stored = new Map<string, VersionedState<ConversationData>>();
		const createdPets: Array<{ name: string; ownerID: UserID }> = [];
		const runtime = ManagedRuntime.make(
			Layer.mergeAll(
				Layer.mock(UserRepository, {
					getUserByTelegramID: Effect.fn('UserRepository.getUserByTelegramID')(
						function* (id: number) {
							chats.add(id);
							if (chats.size === 2)
								yield* Deferred.succeed(bothChatsStarted, undefined);
							yield* Deferred.await(bothChatsStarted);
							return Option.some({
								id: `user-${id}` as UserID,
								telegramID: String(id),
								firstName: 'Test',
								lastName: null,
								username: null,
							});
						},
					),
				}),
				Layer.mock(PetRepository, {
					createPet: Effect.fn('PetRepository.createPet')(
						function* (name, ownerID) {
							createdPets.push({ name, ownerID });
							yield* Effect.logInfo('Pet created').pipe(
								Effect.annotateLogs({ userId: ownerID }),
							);
						},
					),
					getUserOwnedPets: Effect.fn('PetRepository.getUserOwnedPets')(
						function* (id: UserID) {
							yield* Effect.logInfo('Pet status requested').pipe(
								Effect.annotateLogs({ userId: id }),
							);
							return [];
						},
					),
					getUserCaredPets: () => Effect.succeed([]),
				}),
			).pipe(Layer.provideMerge(TelemetryLive)),
		);
		try {
			const tracer = await runtime.runPromise(OtelTracer.OtelTracer);
			const makeRunner = () => {
				const { bot } = createBot(
					runtime.runPromise as Execute<AppServices>,
					{
						type: 'key',
						prefix: 'test:',
						version: 0,
						adapter: {
							read: async (key) => stored.get(key),
							write: async (key, value) => {
								stored.set(key, structuredClone(value));
							},
							delete: async (key) => {
								stored.delete(key);
							},
						},
					},
					tracer,
				);
				bot.botInfo = {
					id: 999,
					is_bot: true,
					first_name: 'Test bot',
					username: 'test_bot',
					can_join_groups: true,
					can_read_all_group_messages: false,
					supports_inline_queries: false,
					can_connect_to_business: false,
					has_main_web_app: false,
					has_topics_enabled: false,
					allows_users_to_create_topics: false,
					can_manage_bots: false,
					supports_join_request_queries: false,
				};
				return createGrammyRunner(bot);
			};
			let runner = makeRunner();
			await Promise.all(
				[1, 2].map((id) =>
					runner.dispatch({
						update_id: id,
						message: {
							message_id: id,
							date: 0,
							chat: { id, type: 'private', first_name: 'Test' },
							from: { id, is_bot: false, first_name: 'Test' },
							text: '/status_racao',
							entities: [{ offset: 0, length: 13, type: 'bot_command' }],
						},
					}),
				),
			);
			expect(
				runner.calls.filter((call) => call.method === 'sendMessage'),
			).toHaveLength(2);
			for (const [index, text] of [
				'/adicionar_pet',
				'Luna',
				'/adicionar_pet',
				'Theo',
				'/ping',
			].entries()) {
				if (index === 1) runner = makeRunner();
				await runner.dispatch({
					update_id: index + 3,
					message: {
						message_id: index + 3,
						date: 0,
						chat: { id: 1, type: 'private', first_name: 'Test' },
						from: { id: 1, is_bot: false, first_name: 'Test' },
						text,
						entities: text.startsWith('/')
							? [{ offset: 0, length: text.length, type: 'bot_command' }]
							: [],
					},
				});
				if (index === 0 || index === 2) {
					expect(stored.size).toBe(1);
					expect(JSON.stringify([...stored.values()])).not.toContain('spanId');
				}
			}
			expect(createdPets).toEqual([
				{ name: 'Luna', ownerID: 'user-1' },
				{ name: 'Theo', ownerID: 'user-1' },
			]);
			expect(stored.size).toBe(0);
			expect(runner.calls).toContainEqual({
				method: 'sendMessage',
				payload: expect.objectContaining({
					text: 'Pet cadastrado com sucesso!',
				}),
			});
			await runtime.dispose();
			const payload = Schema.decodeUnknownSync(
				Schema.Struct({
					resourceSpans: Schema.Array(
						Schema.Struct({
							scopeSpans: Schema.Array(
								Schema.Struct({
									spans: Schema.Array(
										Schema.Struct({
											name: Schema.String,
											traceId: Schema.String,
											spanId: Schema.String,
											parentSpanId: Schema.optional(Schema.String),
											attributes: Schema.Array(
												Schema.Struct({
													key: Schema.String,
													value: Schema.Struct({
														intValue: Schema.optional(Schema.Number),
														stringValue: Schema.optional(Schema.String),
													}),
												}),
											),
										}),
									),
								}),
							),
						}),
					),
				}),
			)(
				collector.requests.find((request) => request.path === '/v1/traces')
					?.body,
			);
			const spans = payload.resourceSpans.flatMap((resource) =>
				resource.scopeSpans.flatMap((scope) => scope.spans),
			);
			expect(new Set(spans.map((span) => span.traceId)).size).toBe(7);
			const updates = new Map(
				spans
					.filter((span) => span.name === 'telegram.update')
					.map((span) => [
						span.attributes.find(
							(attribute) => attribute.key === 'telegram.update.id',
						)?.value.intValue,
						span,
					]),
			);
			const conversationIds = [3, 4, 5, 6].map(
				(id) =>
					updates
						.get(id)
						?.attributes.find(
							(attribute) => attribute.key === 'conversation.id',
						)?.value.stringValue,
			);
			expect(conversationIds[0]).toEqual(expect.any(String));
			expect(conversationIds[1]).toBe(conversationIds[0]);
			expect(conversationIds[2]).toEqual(expect.any(String));
			expect(conversationIds[2]).not.toBe(conversationIds[0]);
			expect(conversationIds[3]).toBe(conversationIds[2]);
			for (const id of [1, 2, 3, 4, 5, 6, 7]) {
				const update = updates.get(id);
				expect(update).toBeDefined();
				const trace = spans.filter((span) => span.traceId === update?.traceId);
				expect(trace.filter((span) => !span.parentSpanId)).toHaveLength(1);
				const apiSpans = trace.filter(
					(span) => span.name === 'telegram.api.sendMessage',
				);
				// A resumed conversation reuses old responses without new API spans.
				expect(apiSpans).toHaveLength(1);
				expect(apiSpans[0]?.parentSpanId, `Update ${id}`).toBe(
					trace.find(
						(span) =>
							span.name ===
							(id <= 2
								? 'FoodStatusCommand'
								: id === 7
									? 'PingCommand'
									: 'replyMiddleware'),
					)?.spanId ?? update?.spanId,
				);
				expect(
					trace.filter(
						(span) => span.name === 'UserRepository.getUserByTelegramID',
					),
				).toHaveLength(1);
				for (const span of trace.filter((span) => span !== update)) {
					expect(trace.map((span) => span.spanId)).toContain(span.parentSpanId);
				}
				if (id >= 3 && id <= 6) {
					expect(trace.map((span) => span.name)).toContain(
						'telegram.conversation.external',
					);
					for (const span of trace.filter(
						(span) =>
							span.name === 'telegram.conversation.external' ||
							span.name === 'PetRepository.createPet',
					)) {
						expect(span.attributes).toContainEqual({
							key: 'conversation.id',
							value: { stringValue: conversationIds[id - 3] },
						});
					}
					if (id === 4 || id === 6) {
						expect(trace.map((span) => span.name)).toContain(
							'PetRepository.createPet',
						);
					}
				} else {
					expect(
						update?.attributes.some(
							(attribute) => attribute.key === 'conversation.id',
						),
					).toBe(false);
				}
				if (id <= 2) {
					expect(trace.map((span) => span.name)).toEqual(
						expect.arrayContaining([
							'telegram.update',
							'telegram.command',
							'replyMiddleware',
							'UserRepository.getUserByTelegramID',
							'FoodStatusCommand',
						]),
					);
					expect(
						trace.find((span) => span.name === 'telegram.command')
							?.parentSpanId,
					).toBe(update?.spanId);
					expect(
						trace.find((span) => span.name === 'FoodStatusCommand')
							?.parentSpanId,
					).toBe(trace.find((span) => span.name === 'replyMiddleware')?.spanId);
				}
				if (id === 3 || id === 5 || id === 7) continue;
				expect(
					collector.requests.find((request) => request.path === '/v1/logs')
						?.body,
				).toMatchObject({
					resourceLogs: [
						{
							scopeLogs: [
								{
									logRecords: expect.arrayContaining([
										expect.objectContaining({
											traceId: update?.traceId,
											body: {
												stringValue:
													id <= 2 ? 'Pet status requested' : 'Pet created',
											},
											attributes: expect.arrayContaining([
												{
													key: 'userId',
													value: { stringValue: `user-${id <= 2 ? id : 1}` },
												},
												...(id <= 2
													? []
													: [
															{
																key: 'conversation.id',
																value: { stringValue: conversationIds[id - 3] },
															},
														]),
											]),
										}),
									]),
								},
							],
						},
					],
				});
			}
		} finally {
			await runtime.dispose();
			await collector.close();
			config.url = undefined;
		}
	});
});
