import { createClient } from '@libsql/client';
import { pushSQLiteSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/libsql';
import { Config, Effect, Option, Redacted } from 'effect';

import * as DbSchema from './schema.js';

export const syncDatabaseSchema = Effect.fn('Database.syncSchema')(
	function* () {
		const url = yield* Config.String('DATABASE_URL');
		const authToken = yield* Config.option(
			Config.Redacted('DATABASE_AUTH_TOKEN'),
		);
		const client = yield* Effect.acquireRelease(
			Effect.sync(() =>
				createClient({
					url,
					authToken: Option.isSome(authToken)
						? Redacted.value(authToken.value)
						: undefined,
				}),
			),
			(client) => Effect.sync(() => client.close()),
		);
		const db = drizzle(client, { schema: DbSchema });
		const schemaPush = yield* Effect.tryPromise(() =>
			pushSQLiteSchema(DbSchema, db),
		);

		if (schemaPush.hasDataLoss) {
			return yield* Effect.die(
				new Error(
					'Automatic schema push would lose data. Apply this schema change manually.',
				),
			);
		}

		for (const warning of schemaPush.warnings) {
			yield* Effect.logWarning(`[Database schema]: ${warning}`);
		}

		yield* Effect.tryPromise(() => schemaPush.apply());
	},
);
