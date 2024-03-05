import { createId } from '@paralleldrive/cuid2';

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { add } from 'date-fns';

import { PetFoodID, petFoodTable, PetID, petsTable } from '../database/schema.js';
import { db } from '../database/db.js';
import { getConfig } from './config.js';
import { triggerClient } from '../trigger/trigger-client.js';
import { wrapTry } from '../../common/utils/wrap-try.js';

type PetFood = typeof petFoodTable.$inferSelect;

export const getDailyFoodConsumption = async (petID: PetFood['petID'], from: Date, to: Date) => {
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

export const addPetFood = (values: Omit<typeof petFoodTable.$inferInsert, 'id'>) => {
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

export const getLastPetFood = (petID: PetID) => {
	return db
		.select({ id: petFoodTable.id })
		.from(petFoodTable)
		.where(eq(petFoodTable.petID, petID))
		.orderBy(desc(petFoodTable.time))
		.limit(1)
		.get();
};

export const cancelPetFoodNotification = async (petFoodID: PetFoodID) => {
	await wrapTry(
		() => triggerClient.cancelEvent(`pet-food-notification:${petFoodID}`),
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

	await wrapTry(
		() =>
			triggerClient.sendEvent(
				{
					id: `pet-food-notification:${petFoodID}`,
					name: 'pet-food-notification',
					payload: {
						petID: petID
					}
				},
				{
					deliverAt: add(time, delay)
				}
			),
		(err) => console.log('Failed to schedule notifications', err)
	);
};
