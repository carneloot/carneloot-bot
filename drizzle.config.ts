import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
	out: './migrations',
	schema: './src/lib/database/schema.ts',
	driver: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL as string,
		authToken: process.env.DATABASE_AUTH_TOKEN as string
	},
	verbose: true,
	strict: true
} satisfies Config;
