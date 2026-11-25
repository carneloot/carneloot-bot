import { Effect, Layer, Schema } from 'effect';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
	HttpApiError,
	HttpApiMiddleware,
	HttpApiSchema,
} from 'effect/http-api';

export const DatabaseErrorResponse = Schema.Struct({
	message: Schema.Literal('Database error'),
}).pipe(HttpApiSchema.status(500));

export const InvalidRequestBody = Schema.Struct({
	message: Schema.Literal('Invalid request body'),
}).pipe(HttpApiSchema.status(400));

export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
	'api/RequestValidation',
	{ error: InvalidRequestBody },
) {}

const invalidBodyResponse = HttpServerResponse.jsonUnsafe(
	{ message: 'Invalid request body' },
	{ status: 400 },
);

export const RequestValidationLive = Layer.succeed(
	RequestValidation,
	(httpEffect) =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const contentType = request.headers['content-type'];
			// Retain the previous JSON media types and 400 response for other bodies.
			if (
				!contentType ||
				!/^application\/([a-z.-]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/.test(
					contentType,
				)
			) {
				return invalidBodyResponse;
			}
			return yield* httpEffect.pipe(
				Effect.provideService(
					HttpServerRequest.HttpServerRequest,
					request.modify({
						headers: Headers.set(
							request.headers,
							'content-type',
							'application/json',
						),
					}),
				),
				Effect.catch((error) =>
					HttpApiError.HttpApiSchemaError.is(error) && error.kind === 'Payload'
						? Effect.succeed(invalidBodyResponse)
						: Effect.fail(error),
				),
			);
		}),
);
