import { drizzle } from 'drizzle-orm/bun-sqlite';

import { Env } from '../../common/env.js';

export const db = drizzle(Env.DATABASE_URL);
