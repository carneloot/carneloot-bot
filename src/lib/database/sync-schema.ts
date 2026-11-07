import { createClient } from '@libsql/client';
import { pushSQLiteSchema } from 'drizzle-kit/api';
import { drizzle } from 'drizzle-orm/libsql';
import { Effect, Redacted } from 'effect';

import { Env } from '../../common/env.js';
import * as DbSchema from './schema.js';

export const syncDatabaseSchema = Effect.fn('Database.syncSchema')(
	function* () {
		const client = yield* Effect.acquireRelease(
			Effect.sync(() =>
				createClient({
					url: Env.DATABASE_URL,
					authToken: Env.DATABASE_AUTH_TOKEN?.pipe(Redacted.value),
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
