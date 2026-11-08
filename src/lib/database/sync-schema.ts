import { pushSQLiteSchema } from 'drizzle-kit/api';

import { db } from './db.js';
import * as DbSchema from './schema.js';

export const syncDatabaseSchema = async () => {
	const schemaPush = await pushSQLiteSchema(DbSchema, db);

	if (schemaPush.hasDataLoss) {
		throw new Error(
			'Automatic schema push would lose data. Apply this schema change manually.',
		);
	}

	for (const warning of schemaPush.warnings) {
		console.warn(`[Database schema]: ${warning}`);
	}

	await schemaPush.apply();
};
