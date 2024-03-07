import type { Config } from 'drizzle-kit';

import { Env } from './src/common/env.js';

export default {
	out: './migrations',
	schema: './src/lib/database/schema.ts',
	driver: 'turso',
	dbCredentials: {
		url: Env.DATABASE_URL,
		authToken: Env.DATABASE_AUTH_TOKEN
	},
	verbose: true,
	strict: true
} satisfies Config;
