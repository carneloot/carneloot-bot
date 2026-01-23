import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse
} from '@effect/platform';

import { Effect, flow, Redacted, Schema } from 'effect';
import { Env } from '../../../common/env.js';
import { DokploySchema } from './dokploy.schema.js';

const API_KEY_HEADER = 'x-api-key';

export class DokployService extends Effect.Service<DokployService>()(
	'carneloot-bot/lib/services/dokploy/dokploy.service/DokployService',
	{
		scoped: Effect.gen(function* () {
			const url = Env.DOKPLOY_URL;
			const apiKey = Env.DOKPLOY_API_KEY;

			const client = (yield* HttpClient.HttpClient).pipe(
				HttpClient.retryTransient({}),
				HttpClient.filterStatusOk,
				HttpClient.mapRequest(
					flow(
						HttpClientRequest.setHeader(API_KEY_HEADER, Redacted.value(apiKey)),
						HttpClientRequest.prependUrl(url),
						HttpClientRequest.acceptJson
					)
				)
			);

			const compose = {
				one: Effect.fn('Dokploy.compose.one')(
					function* (composeId: DokploySchema.Id) {
						const data = yield* client
							.get('/compose.one', { urlParams: { composeId } })
							.pipe(
								Effect.andThen(
									HttpClientResponse.schemaBodyJson(DokploySchema.Compose)
								)
							);

						return data;
					},
					Effect.mapError((cause) => new DokploySchema.DokployError({ cause }))
				),
				start: Effect.fn('Dokploy.compose.start')(
					function* (composeId: DokploySchema.Id) {
						yield* client
							.pipe(
								HttpClient.mapRequestEffect(
									HttpClientRequest.schemaBodyJson(
										Schema.Struct({
											composeId: DokploySchema.Id
										})
									)({ composeId })
								)
							)
							.post('/compose.start');
					},
					Effect.mapError((cause) => new DokploySchema.DokployError({ cause }))
				),
				stop: Effect.fn('Dokploy.compose.stop')(
					function* (composeId: DokploySchema.Id) {
						yield* client
							.pipe(
								HttpClient.mapRequestEffect(
									HttpClientRequest.schemaBodyJson(
										Schema.Struct({
											composeId: DokploySchema.Id
										})
									)({ composeId })
								)
							)
							.post('/compose.stop');
					},
					Effect.mapError((cause) => new DokploySchema.DokployError({ cause }))
				)
			} as const;

			const docker = {
				getContainers: Effect.fn('Dokploy.docker.getContainers')(
					function* (serverId: DokploySchema.Id) {
						const data = yield* client
							.get('/docker.getContainers', { urlParams: { serverId } })
							.pipe(
								Effect.andThen(
									HttpClientResponse.schemaBodyJson(
										Schema.Array(DokploySchema.Container)
									)
								)
							);

						return data;
					},
					Effect.mapError((cause) => new DokploySchema.DokployError({ cause }))
				),
				getConfig: Effect.fn('Dokploy.docker.getConfig')(
					function* (
						containerId: DokploySchema.Id,
						serverId?: DokploySchema.Id
					) {
						const data = yield* client
							.get('/docker.getConfig', {
								urlParams: {
									containerId,
									serverId
								}
							})
							.pipe(
								Effect.andThen(
									HttpClientResponse.schemaBodyJson(
										DokploySchema.ContainerConfig
									)
								)
							);

						return data;
					},
					Effect.mapError((cause) => new DokploySchema.DokployError({ cause }))
				)
			} as const;

			return {
				compose,
				docker
			} as const;
		})
	}
) {}
