import { Activity, DurableDeferred, Workflow } from '@effect/workflow';

import { Array, Effect, Option, Schema } from 'effect';

import { BotError, matchBotError } from '../../../common/error.js';
import { Env } from '../../../common/env.js';

import { DokployService } from '../../../lib/services/dokploy/dokploy.service.js';
import { Bot } from '../../../lib/services/bot.js';
import { DokploySchema } from '../../../lib/services/dokploy/dokploy.schema.js';

export class ContainerNotFoundError extends Schema.TaggedError<ContainerNotFoundError>(
	'ContainerNotFoundError'
)('ContainerNotFoundError', {
	composeId: Schema.String
}) {}

class HealthCheckError extends Schema.TaggedError<HealthCheckError>(
	'HealthCheckError'
)('HealthCheckError', {}) {}

export const StartServerWorkflow = Workflow.make({
	name: 'minecraft/StartServer',
	idempotencyKey: ({ messageId, userId }) => `${userId}:${messageId}`,
	payload: {
		messageId: Schema.Number,
		userId: Schema.String,
		chatId: Schema.Number
	},
	error: Schema.Union(
		ContainerNotFoundError,
		DokploySchema.DokployError,
		Schema.instanceOf(BotError),
		HealthCheckError
	)
});

const ServerHealthy = DurableDeferred.make('ServerHealthy', {
	error: HealthCheckError
});

export const StartServerWorkflowLayer = StartServerWorkflow.toLayer(
	Effect.fn(function* (payload) {
		const dokploy = yield* DokployService;
		const composeId = Env.DOKPLOY_COMPOSE_ID;

		const compose = yield* dokploy.compose.one(composeId);

		const { appName, serverId } = compose;

		const serverContainers = yield* dokploy.docker.getContainers(serverId);

		const maybeMinecraftContainer = Array.findFirst(
			serverContainers,
			(container) =>
				container.name.startsWith(appName) &&
				container.image === 'itzg/minecraft-server'
		);

		if (Option.isNone(maybeMinecraftContainer)) {
			return yield* new ContainerNotFoundError({ composeId });
		}

		const minecraftContainer = maybeMinecraftContainer.value;

		if (minecraftContainer.state === 'running') {
			return yield* Activity.make({
				name: 'SendAlreadyRunningMessage',
				error: Schema.instanceOf(BotError),
				execute: Effect.gen(function* () {
					const bot = yield* Bot;

					yield* Effect.tryPromise({
						try: () =>
							bot.api.editMessageText(
								payload.chatId,
								payload.messageId,
								'O servidor já está rodando!'
							),
						catch: (cause) => {
							const error = matchBotError(cause);
							if (error) return error;
							throw cause;
						}
					}).pipe(
						Effect.withSpan('bot.api.editMessageText', {
							attributes: {
								chat_id: payload.chatId,
								message_id: payload.messageId
							}
						})
					);
				})
			});
		}

		yield* Activity.make({
			name: 'StartServer',
			error: DokploySchema.DokployError,
			execute: dokploy.compose.start(composeId)
		});

		yield* Activity.make({
			name: 'UpdateStatusToWaiting',
			error: Schema.instanceOf(BotError),
			execute: Effect.gen(function* () {
				const bot = yield* Bot;

				yield* Effect.tryPromise({
					try: () =>
						bot.api.editMessageText(
							payload.chatId,
							payload.messageId,
							'Aguardando servidor iniciar...'
						),
					catch: (cause) => {
						const error = matchBotError(cause);
						if (error) return error;
						throw cause;
					}
				}).pipe(
					Effect.withSpan('bot.api.editMessageText', {
						attributes: {
							chat_id: payload.chatId,
							message_id: payload.messageId
						}
					})
				);
			})
		});

		const token = yield* DurableDeferred.token(ServerHealthy);

		yield* Effect.forkDaemon(
			Effect.gen(function* () {
				while (true) {
					const containerConfig = yield* dokploy.docker.getConfig(
						minecraftContainer.containerId,
						minecraftContainer.serverId
					);

					yield* Effect.logInfo(
						`Minecraft container info: ${containerConfig.State.Health.Status}`
					);

					if (containerConfig.State.Health.Status === 'healthy') {
						break;
					}

					yield* Effect.sleep('15 seconds');
				}

				yield* DurableDeferred.succeed(ServerHealthy, {
					token,
					value: void 0
				});
			}).pipe(
				Effect.timeout('3 minutes'),
				Effect.catchTag('TimeoutException', () =>
					DurableDeferred.fail(ServerHealthy, {
						token,
						error: new HealthCheckError()
					})
				)
			)
		);
		yield* DurableDeferred.await(ServerHealthy);

		yield* Activity.make({
			name: 'UpdateStatusToFinished',
			error: Schema.instanceOf(BotError),
			execute: Effect.gen(function* () {
				const bot = yield* Bot;

				yield* Effect.tryPromise({
					try: () =>
						bot.api.editMessageText(
							payload.chatId,
							payload.messageId,
							'Servidor iniciado!'
						),
					catch: (cause) => {
						const error = matchBotError(cause);
						if (error) return error;
						throw cause;
					}
				}).pipe(
					Effect.withSpan('bot.api.editMessageText', {
						attributes: {
							chat_id: payload.chatId,
							message_id: payload.messageId
						}
					})
				);
			})
		});
	})
);
