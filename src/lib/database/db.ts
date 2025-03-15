import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { Env } from '../../common/env.js';

const client = createClient({
	url: Env.DATABASE_URL,
	authToken: Env.DATABASE_AUTH_TOKEN
});

export const db = drizzle(client);
