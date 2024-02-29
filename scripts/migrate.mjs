import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import 'dotenv/config';

const sqlite = createClient({
	url: process.env.DATABASE_URL,
	authToken: process.env.DATABASE_AUTH_TOKEN
});
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './migrations' });

console.log('Ran successfully');
