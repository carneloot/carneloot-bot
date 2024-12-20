import type { Config } from 'drizzle-kit';
import invariant from 'tiny-invariant';

invariant(process.env.DATABASE_URL, 'DATABASE_URL is required');

export default {
	out: './migrations',
	schema: './src/lib/database/schema.ts',
	dialect: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL,
		authToken: process.env.DATABASE_AUTH_TOKEN
	},
	verbose: true,
	strict: true
} satisfies Config;
