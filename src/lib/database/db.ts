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
	Cause,
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

export type TransactionClient = LibSQLTransaction<
	typeof DbSchema,
	ExtractTablesWithRelations<typeof DbSchema>
>;

export type Transaction = <T>(
	fn: (client: TransactionClient) => Promise<T>,
) => Effect.Effect<T, DatabaseError>;

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

class TransactionFailure<E> {
	public constructor(public readonly cause: Cause.Cause<E>) {}
}

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
		<T, E, R>(execute: (tx: Transaction) => Effect.Effect<T, E, R>) =>
			Effect.context<R>().pipe(
				Effect.flatMap((context) =>
					Effect.callback<T, E>((resume, signal) => {
						const transaction = db.transaction(async (tx) => {
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
								{ signal },
							);

							return Exit.match(result, {
								onSuccess: (value) => value,
								onFailure: (cause) =>
									Promise.reject(new TransactionFailure(cause)),
							});
						});

						const completion = transaction.then(
							(value) => resume(Effect.succeed(value)),
							(cause) =>
								resume(
									cause instanceof TransactionFailure
										? Effect.failCause(cause.cause)
										: Effect.die(cause),
								),
						);

						return Effect.promise(() => completion);
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

	const checkHealth = Effect.fn('Database.checkHealth')(() =>
		Effect.tryPromise({
			try: () => client.execute('SELECT 1'),
			catch: (cause) => matchError(cause) ?? cause,
		}).pipe(Effect.asVoid, Effect.withSpan('database.health')),
	);

	return {
		execute,
		transaction,
		makeQuery,
		checkHealth,
	} as const;
});

type Shape = Effect.Success<typeof makeService>;

export class Database extends Context.Service<Database, Shape>()('Database') {}

export const layer = Layer.effect(Database, makeService);
