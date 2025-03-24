import {
	type Client as LibSQLClient,
	LibsqlError,
	createClient
} from '@libsql/client';

import type { ExtractTablesWithRelations } from 'drizzle-orm';
import {
	type LibSQLDatabase,
	type LibSQLTransaction,
	drizzle
} from 'drizzle-orm/libsql';
import {
	Cause,
	Data,
	Effect,
	Exit,
	Layer,
	Predicate,
	Runtime,
	Schedule
} from 'effect';

import { Env } from '../../common/env.js';

import * as DbSchema from './schema.js';

type Client = LibSQLDatabase<typeof DbSchema> & {
	$client: LibSQLClient;
};

type TransactionClient = LibSQLTransaction<
	typeof DbSchema,
	ExtractTablesWithRelations<typeof DbSchema>
>;

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
	cause: LibsqlError;
}> {
	public override toString() {
		return `DatabaseError: ${this.message}`;
	}

	public get message() {
		return this.cause.message;
	}
}

const matchError = (cause: unknown) => {
	if (cause instanceof LibsqlError) {
		return new DatabaseError({ cause });
	}

	return null;
};

const makeService = Effect.gen(function* () {
	const client = yield* Effect.acquireRelease(
		Effect.sync(() =>
			createClient({
				url: Env.DATABASE_URL,
				authToken: Env.DATABASE_AUTH_TOKEN
			})
		),
		(client) => Effect.sync(() => client.close())
	);

	// Trying to reach the database
	yield* Effect.tryPromise(() => client.execute('SELECT 1')).pipe(
		Effect.retry(
			Schedule.jitteredWith(Schedule.spaced('1.25 seconds'), {
				min: 0.5,
				max: 1.5
			}).pipe(
				Schedule.tapOutput((output) =>
					Effect.logWarning(
						`[Database client]: Connection to the database failed. Retrying (attempt ${output}).`
					)
				)
			)
		),
		Effect.tap(() =>
			Effect.logInfo('[Database client]: Connection to the database establised')
		),
		Effect.orDie
	);

	const db = drizzle(client, { schema: DbSchema });

	const execute = Effect.fn('Database.execute')(
		<T>(fn: (client: typeof db) => Promise<T>) =>
			Effect.tryPromise({
				try: () => fn(db),
				catch: (cause) => {
					const error = matchError(cause);
					if (Predicate.isNotNull(error)) {
						return error;
					}
					throw cause;
				}
			})
	);

	const transaction = Effect.fn('Database.transaction')(
		<T, E, R>(
			execute: (
				tx: <U>(
					fn: (client: TransactionClient) => Promise<U>
				) => Effect.Effect<U, DatabaseError>
			) => Effect.Effect<T, E, R>
		) =>
			Effect.runtime<R>().pipe(
				Effect.map(Runtime.runPromiseExit),
				Effect.flatMap((runPromiseExit) =>
					Effect.async((resume) => {
						db.transaction(async (tx) => {
							const txWrapper = (
								// biome-ignore lint/suspicious/noExplicitAny: don't care what is returned here
								fn: (client: TransactionClient) => Promise<any>
							) =>
								Effect.tryPromise({
									try: () => fn(tx),
									catch: (cause) => {
										const error = matchError(cause);
										if (Predicate.isNotNull(error)) {
											return error;
										}
										throw cause;
									}
								});

							const result = await runPromiseExit(execute(txWrapper));

							Exit.match(result, {
								onSuccess: (value) => {
									resume(Effect.succeed(value));
								},
								onFailure: (cause) => {
									if (Cause.isFailure(cause)) {
										// @ts-expect-error
										resume(Effect.fail(Cause.originalError(cause)));
									} else {
										resume(Effect.die(cause));
									}
								}
							});
						});
					})
				)
			)
	);

	const makeQuery = <TInput, TResult, TError, TContext>(
		queryFn: (
			execute: <T>(
				fn: (client: Client | TransactionClient) => Promise<T>
			) => Effect.Effect<T, DatabaseError>,
			input: TInput
		) => Effect.Effect<TResult, TError, TContext>
	) => {
		return (
			input: TInput,
			tx?: <T>(
				fn: (client: TransactionClient) => Promise<T>
			) => Effect.Effect<T, DatabaseError>
		) => {
			return queryFn(tx ?? execute, input);
		};
	};

	return {
		execute,
		transaction,
		makeQuery
	} as const;
});

type Shape = Effect.Effect.Success<typeof makeService>;

export class Database extends Effect.Tag('Database')<Database, Shape>() {}

export const layer = Layer.scoped(Database, makeService);

const oldClient = createClient({
	url: Env.DATABASE_URL,
	authToken: Env.DATABASE_AUTH_TOKEN
});

export const db = drizzle(oldClient, { schema: DbSchema });
