import { createId } from '@paralleldrive/cuid2';

import { and, eq } from 'drizzle-orm';
import type { StorageAdapter } from 'grammy';

import { db, dbClient } from '../database/db.js';
import { sessionsTable } from '../database/schema.js';

export const createSessionStorage = <T>(context: string) => {
	return {
		read: async (key: string) => {
			const result = await db
				.select({
					value: sessionsTable.value
				})
				.from(sessionsTable)
				.where(
					and(eq(sessionsTable.context, context), eq(sessionsTable.key, key))
				)
				.get();

			if (!result) {
				return undefined;
			}

			return result.value as T;
		},

		write: async (key: string, value: T) => {
			await db
				.insert(sessionsTable)
				.values({
					id: createId(),
					context,
					key,
					value
				})
				.onConflictDoUpdate({
					target: [sessionsTable.context, sessionsTable.key],
					set: {
						value: value
					}
				});
			await dbClient.sync();
		},

		delete: async (key: string) => {
			await db
				.delete(sessionsTable)
				.where(
					and(eq(sessionsTable.context, context), eq(sessionsTable.key, key))
				);
			await dbClient.sync();
		}
	} satisfies StorageAdapter<T>;
};
