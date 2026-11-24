import { Context, Effect, Layer, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
	HttpApiMiddleware,
	HttpApiSchema,
	HttpApiSecurity,
} from 'effect/http-api';

import { type User, UserRepository } from '../lib/repositories/user.js';
import { DatabaseErrorResponse } from './errors.js';

export class AuthenticatedUser extends Context.Service<
	AuthenticatedUser,
	{ user: User; apiKey: string }
>()('api/AuthenticatedUser') {}

export class ApiKeyAuth extends HttpApiMiddleware.Service<
	ApiKeyAuth,
	{ provides: AuthenticatedUser }
>()('api/ApiKeyAuth', {
	security: { bearer: HttpApiSecurity.bearer },
	error: [
		Schema.Struct({ message: Schema.Literal('Unauthorized') }).pipe(
			HttpApiSchema.status(401),
		),
		Schema.Struct({
			message: Schema.Literal('Malformed Authorization header'),
		}).pipe(HttpApiSchema.status(400)),
		DatabaseErrorResponse,
	],
}) {}

export const ApiKeyAuthLive = Layer.effect(
	ApiKeyAuth,
	Effect.gen(function* () {
		const repository = yield* UserRepository;
		return {
			bearer: (httpEffect) =>
				Effect.gen(function* () {
					const request = yield* HttpServerRequest.HttpServerRequest;
					const header = request.headers.authorization;
					if (!header) {
						return HttpServerResponse.jsonUnsafe(
							{ message: 'Unauthorized' },
							{
								status: 401,
								headers: { 'WWW-Authenticate': 'Bearer realm=""' },
							},
						);
					}
					const match = /^Bearer +([A-Za-z0-9._~+/-]+=*) *$/.exec(header);
					const apiKey = match?.[1];
					if (!apiKey) {
						return HttpServerResponse.jsonUnsafe(
							{ message: 'Malformed Authorization header' },
							{
								status: 400,
								headers: {
									'WWW-Authenticate': 'Bearer error="invalid_request"',
								},
							},
						);
					}
					return yield* repository.getUserFromApiKey(apiKey).pipe(
						Effect.flatMap((user) =>
							Effect.provideService(httpEffect, AuthenticatedUser, {
								user,
								apiKey,
							}),
						),
						Effect.catchTags({
							UserNotFoundError: () =>
								Effect.succeed(
									HttpServerResponse.jsonUnsafe(
										{ message: 'Unauthorized' },
										{
											status: 401,
											headers: {
												'WWW-Authenticate': 'Bearer error="invalid_token"',
											},
										},
									),
								),
							DatabaseError: () =>
								Effect.succeed(
									HttpServerResponse.jsonUnsafe(
										{ message: 'Database error' },
										{ status: 500 },
									),
								),
						}),
					);
				}),
		};
	}),
);
