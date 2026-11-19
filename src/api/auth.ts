import { Effect, Result } from 'effect';
import type { MiddlewareHandler } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';

import { getUserFromApiKey, type User } from '../lib/entities/user.js';
import { runtime } from '../runtime.js';

export const apiKeyAuth: MiddlewareHandler<{ Variables: { user: User } }> =
	bearerAuth({
		verifyToken: async (token, c) => {
			const result = await runtime.runPromise(
				Effect.result(getUserFromApiKey(token)),
			);
			if (Result.isFailure(result)) {
				if (result.failure._tag === 'UserNotFoundError') return false;
				throw new HTTPException(500, {
					res: c.json({ message: 'Database error' }, 500),
				});
			}
			c.set('user', result.success);
			return true;
		},
		noAuthenticationHeader: { message: { message: 'Unauthorized' } },
		invalidAuthenticationHeader: {
			message: { message: 'Malformed Authorization header' },
		},
		invalidToken: { message: { message: 'Unauthorized' } },
	});
