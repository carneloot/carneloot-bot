import {
	createClient,
	type Client as LibSQLClient,
	LibsqlError,
} from '@libsql/client';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import {
	drizzle,
	type LibSQLDatabase,
	type LibSQLTransaction,
} from 'drizzle-orm/libsql';
import {
	Context,
	Data,
	Effect,
	Exit,
	Layer,
	Predicate,
	Redacted,
	Schedule,
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
				authToken: Env.DATABASE_AUTH_TOKEN?.pipe(Redacted.value),
			}),
		),
		(client) => Effect.sync(() => client.close()),
	);

	// Trying to reach the database
	yield* Effect.tryPromise(() => client.execute('SELECT 1')).pipe(
		Effect.retry(
			Schedule.spaced('1.25 seconds').pipe(
				Schedule.jittered,
				Schedule.tap(({ output }) =>
					Effect.logWarning(
						`[Database client]: Connection to the database failed. Retrying (attempt ${output}).`,
					),
				),
			),
		),
		Effect.tap(() =>
			Effect.logInfo(
				'[Database client]: Connection to the database establised',
			),
		),
		Effect.orDie,
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
				},
			}),
	);

	const transaction = Effect.fn('Database.transaction')(
		<T, E, R>(
			execute: (
				tx: <U>(
					fn: (client: TransactionClient) => Promise<U>,
				) => Effect.Effect<U, DatabaseError>,
			) => Effect.Effect<T, E, R>,
		) =>
			Effect.context<R>().pipe(
				Effect.flatMap((context) =>
					Effect.callback<T, E>((resume) => {
						void db
							.transaction(async (tx) => {
								const txWrapper = <U>(
									fn: (client: TransactionClient) => Promise<U>,
								) =>
									Effect.tryPromise({
										try: () => fn(tx),
										catch: (cause) => {
											const error = matchError(cause);
											if (Predicate.isNotNull(error)) {
												return error;
											}
											throw cause;
										},
									});

								const result = await Effect.runPromiseExitWith(context)(
									execute(txWrapper),
								);

								Exit.match(result, {
									onSuccess: (value) => {
										resume(Effect.succeed(value));
									},
									onFailure: (cause) => {
										resume(Effect.failCause(cause));
									},
								});
							})
							.catch((cause) => resume(Effect.die(cause)));
					}),
				),
			),
	);

	const makeQuery = <TInput, TResult, TError, TContext>(
		queryFn: (
			execute: <T>(
				fn: (client: Client | TransactionClient) => Promise<T>,
			) => Effect.Effect<T, DatabaseError>,
			input: TInput,
		) => Effect.Effect<TResult, TError, TContext>,
	) => {
		return (
			input: TInput,
			tx?: <T>(
				fn: (client: TransactionClient) => Promise<T>,
			) => Effect.Effect<T, DatabaseError>,
		) => {
			return queryFn(tx ?? execute, input);
		};
	};

	return {
		execute,
		transaction,
		makeQuery,
	} as const;
});

type Shape = Effect.Success<typeof makeService>;

export class Database extends Context.Service<Database, Shape>()('Database') {}

export const layer = Layer.effect(Database, makeService);

const oldClient = createClient({
	url: Env.DATABASE_URL,
	authToken: Env.DATABASE_AUTH_TOKEN?.pipe(Redacted.value),
});

export const db = drizzle(oldClient, { schema: DbSchema });
