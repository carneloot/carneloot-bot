import { createId } from '@paralleldrive/cuid2';

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../database/db.js';
import {
	type PetFoodID,
	type PetID,
	petFoodTable,
	usersTable
} from '../database/schema.js';

type PetFood = typeof petFoodTable.$inferSelect;

export const addPetFood = (
	values: Omit<typeof petFoodTable.$inferInsert, 'id'>
) => {
	return db
		.insert(petFoodTable)
		.values({
			id: createId() as PetFood['id'],
			...values
		})
		.returning({
			id: petFoodTable.id
		})
		.get();
};

export const updatePetFood = async (
	petFoodID: PetFoodID,
	values: Pick<
		typeof petFoodTable.$inferInsert,
		'time' | 'messageID' | 'quantity'
	>
) => {
	await db
		.update(petFoodTable)
		.set(values)
		.where(eq(petFoodTable.id, petFoodID));
};

export const deletePetFood = async (petFoodID: PetFoodID) => {
	await db.delete(petFoodTable).where(eq(petFoodTable.id, petFoodID));
};

export const getLastPetFood = (petID: PetID) => {
	return db
		.select({ id: petFoodTable.id, time: petFoodTable.time })
		.from(petFoodTable)
		.where(eq(petFoodTable.petID, petID))
		.orderBy(desc(petFoodTable.time))
		.limit(1)
		.get();
};

export const getPetFoodByMessageId = (messageID: number) => {
	return db
		.select({
			id: petFoodTable.id,
			time: petFoodTable.time,
			petID: petFoodTable.petID
		})
		.from(petFoodTable)
		.where(eq(petFoodTable.messageID, messageID))
		.get();
};

export const getPetFoodByRange = (petID: PetID, from: Date, to: Date) => {
	return db
		.select({
			id: petFoodTable.id,
			quantity: petFoodTable.quantity,
			time: petFoodTable.time,
			user: usersTable
		})
		.from(petFoodTable)
		.where(
			and(
				gte(petFoodTable.time, from),
				lte(petFoodTable.time, to),
				eq(petFoodTable.petID, petID)
			)
		)
		.innerJoin(usersTable, eq(petFoodTable.userID, usersTable.id))
		.orderBy(asc(petFoodTable.time))
		.all();
};
