import { createId } from '@paralleldrive/cuid2';

import { StorageAdapter } from 'grammy';
import { and, eq } from 'drizzle-orm';

import { db } from '../database/db.js';
import { sessionsTable } from '../database/schema.js';

export const createSessionStorage = <T>(context: string) => {
	return {
		read: async (key: string) => {
			const result = await db
				.select({
					value: sessionsTable.value
				})
				.from(sessionsTable)
				.where(and(eq(sessionsTable.context, context), eq(sessionsTable.key, key)))
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
		},

		delete: async (key: string) => {
			await db
				.delete(sessionsTable)
				.where(and(eq(sessionsTable.context, context), eq(sessionsTable.key, key)));
		}
	} satisfies StorageAdapter<T>;
};
