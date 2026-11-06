import { eq } from 'drizzle-orm';

import { db } from '../database/db.js';
import { usersTable } from '../database/schema.js';

export type User = typeof usersTable.$inferSelect;

export async function getUserByID(id: User['id']) {
	return db.select().from(usersTable).where(eq(usersTable.id, id)).get();
}

export async function getUserByUsername(
	username: NonNullable<User['username']>,
) {
	return db
		.select()
		.from(usersTable)
		.where(eq(usersTable.username, username))
		.get();
}
