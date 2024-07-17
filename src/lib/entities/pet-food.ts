import { createId } from '@paralleldrive/cuid2';

import { add, set } from 'date-fns';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { fromPromise } from 'neverthrow';

import { isDebug } from '../../common/utils/is-debug.js';
import { db } from '../database/db.js';
import {
	type PetFoodID,
	type PetID,
	petFoodTable,
	petsTable,
	usersTable
} from '../database/schema.js';
import { triggerClient } from '../trigger/trigger-client.js';
import { getConfig } from './config.js';

type PetFood = typeof petFoodTable.$inferSelect;

export const getDailyFoodConsumption = async (
	petID: PetFood['petID'],
	from: Date,
	to: Date
) => {
	return db
		.select({
			id: petsTable.id,
			name: petsTable.name,
			total: sql<number>`sum(${petFoodTable.quantity})`,
			lastTime: sql<number>`max(${petFoodTable.time})`
		})
		.from(petFoodTable)
		.innerJoin(petsTable, eq(petFoodTable.petID, petsTable.id))
		.where(
			and(
				eq(petFoodTable.petID, petID),
				gte(petFoodTable.time, from),
				lt(petFoodTable.time, to)
			)
		)
		.groupBy(petsTable.id)
		.get();
};

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

export const cancelPetFoodNotification = async (petFoodID: PetFoodID) => {
	await fromPromise(
		triggerClient.cancelEvent(`pet-food-notification:${petFoodID}`),
		() => console.warn('Failed to cancel previous notification')
	);
};

export const schedulePetFoodNotification = async (
	petID: PetID,
	petFoodID: PetFoodID,
	time: Date
) => {
	const delay = await getConfig('pet', 'notificationDelay', petID);

	if (!delay) {
		return;
	}

	await fromPromise(
		triggerClient.sendEvent(
			{
				id: `pet-food-notification:${petFoodID}`,
				name: 'pet-food-notification',
				payload: {
					petID: petID
				}
			},
			{
				deliverAt: set(add(time, delay), { seconds: 0, milliseconds: 0 })
			}
		),
		(err) => console.log('Failed to schedule notifications', err)
	);
};
