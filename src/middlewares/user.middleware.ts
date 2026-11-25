import { Effect, Option } from 'effect';
import type { MiddlewareFn } from 'grammy';

import type { Execute } from '../adapters/execute.js';
import { withTelegramSpan } from '../adapters/telegram/tracing.js';
import type { Context } from '../common/types/context.js';
import { UserRepository } from '../lib/repositories/user.js';

export const createUserMiddleware =
	(execute: Execute<UserRepository>): MiddlewareFn<Context> =>
	async (ctx, next) => {
		const from = ctx.from;
		if (!from) {
			await next();
			return;
		}

		const user = await execute(
			Effect.gen(function* () {
				const users = yield* UserRepository;
				return yield* users.getUserByTelegramID(from.id);
			}).pipe(withTelegramSpan(ctx)),
		);

		if (Option.isSome(user)) {
			ctx.user = user.value;
		}

		await next();
	};
