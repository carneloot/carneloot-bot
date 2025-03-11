import { createClient } from '@libsql/client';

import { drizzle } from 'drizzle-orm/libsql';
import { Duration } from 'effect';

import { Env } from '../../common/env.js';

export const dbClient = createClient({
	url: 'file:./data/local.db',
	authToken: Env.DATABASE_AUTH_TOKEN,
	syncUrl: Env.DATABASE_URL,
	syncInterval: Duration.toSeconds('1 hour')
});

await dbClient.sync();

export const db = drizzle(dbClient);
