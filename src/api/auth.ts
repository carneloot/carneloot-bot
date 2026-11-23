import { Effect, Result } from 'effect';
import type { MiddlewareHandler } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';

import type { Execute } from '../adapters/execute.js';
import type { AppServices } from '../app/layer.js';
import { type User, UserRepository } from '../lib/repositories/user.js';

export type AuthVariables = { Variables: { user: User; apiKey: string } };

export const createApiKeyAuth = (
	execute: Execute<AppServices>,
): MiddlewareHandler<AuthVariables> =>
	bearerAuth({
		verifyToken: async (token, c) => {
			const result = await execute(
				Effect.gen(function* () {
					const repository = yield* UserRepository;
					return yield* repository.getUserFromApiKey(token);
				}).pipe(Effect.result),
			);
			if (Result.isFailure(result)) {
				if (result.failure._tag === 'UserNotFoundError') return false;
				throw new HTTPException(500, {
					res: c.json({ message: 'Database error' }, 500),
				});
			}
			c.set('user', result.success);
			c.set('apiKey', token);
			return true;
		},
		noAuthenticationHeader: { message: { message: 'Unauthorized' } },
		invalidAuthenticationHeader: {
			message: { message: 'Malformed Authorization header' },
		},
		invalidToken: { message: { message: 'Unauthorized' } },
	});
