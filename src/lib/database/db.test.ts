import {
	Cause,
	Data,
	Deferred,
	Effect,
	Exit,
	Fiber,
	Layer,
	Result,
} from 'effect';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	class LibsqlError extends Error {}

	const state = {
		events: [] as string[],
		commitError: undefined as Error | undefined,
	};

	const transaction = vi.fn(
		async (callback: (tx: object) => Promise<unknown>) => {
			state.events.push('begin');

			try {
				const result = await callback({});
				if (state.commitError !== undefined) {
					throw state.commitError;
				}

				state.events.push('commit');
				return result;
			} catch (error) {
				state.events.push('rollback');
				throw error;
			}
		},
	);

	const reset = () => {
		state.events = [];
		state.commitError = undefined;
		transaction.mockClear();
	};

	return { LibsqlError, reset, state, transaction };
});

vi.mock('@libsql/client', () => ({
	LibsqlError: mocks.LibsqlError,
	createClient: () => ({
		close: () => undefined,
		execute: async () => undefined,
	}),
}));

vi.mock('drizzle-orm/libsql', () => ({
	drizzle: () => ({ transaction: mocks.transaction }),
}));

process.env.BOT_TOKEN = 'test-token';
process.env.DATABASE_URL = 'file:test.db';
process.env.REDIS_URL = 'redis://localhost:6379';

const { Database, layer } = await import('./db.js');

class TransactionError extends Data.TaggedError('TransactionError')<{
	message: string;
}> {}

type DatabaseService = Effect.Success<typeof Database>;

const run = <A, E>(
	operation: (database: DatabaseService) => Effect.Effect<A, E>,
) =>
	Effect.scoped(
		Effect.gen(function* () {
			const database = yield* Database;
			return yield* operation(database);
		}).pipe(Effect.provide(Layer.fresh(layer))),
	);

describe('Database.transaction', () => {
	it('rolls back and preserves a typed failure', async () => {
		mocks.reset();
		const error = new TransactionError({ message: 'failed' });

		const result = await Effect.runPromise(
			run((database) =>
				database.transaction(() => Effect.fail(error)).pipe(Effect.flip),
			),
		);

		expect(result).toBe(error);
		expect(mocks.state.events).toEqual(['begin', 'rollback']);
	});

	it('waits for and propagates a commit failure', async () => {
		mocks.reset();
		const error = new Error('commit failed');
		mocks.state.commitError = error;

		const exit = await Effect.runPromiseExit(
			run((database) => database.transaction(() => Effect.succeed('saved'))),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			expect(Cause.findDefect(exit.cause)).toEqual(Result.succeed(error));
		}
		expect(mocks.state.events).toEqual(['begin', 'rollback']);
	});

	it('rolls back before an interrupted transaction fiber finishes', async () => {
		mocks.reset();
		const started = await Effect.runPromise(Deferred.make<void>());

		const fiber = Effect.runFork(
			run((database) =>
				database.transaction(() =>
					Deferred.succeed(started, undefined).pipe(
						Effect.andThen(Effect.never),
					),
				),
			),
		);

		await Effect.runPromise(Deferred.await(started));
		await Effect.runPromise(Fiber.interrupt(fiber));

		expect(mocks.state.events).toEqual(['begin', 'rollback']);
	});
});
