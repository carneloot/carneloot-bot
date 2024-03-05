import { createId } from '@paralleldrive/cuid2';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { add } from 'date-fns';

import { petFoodTable, PetID, petsTable } from '../database/schema.js';
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

export const addPetFood = async (values: Omit<typeof petFoodTable.$inferInsert, 'id'>) => {
	await db.insert(petFoodTable).values({
		id: createId() as PetFood['id'],
		...values
	});
};

export const cancelPetFoodNotification = async (petID: PetID) => {
	await wrapTry(
		() => triggerClient.cancelEvent(`pet-food-notification:${petID}`),
		() => console.warn('Failed to cancel previous notification')
	);
};

export const schedulePetFoodNotification = async (petID: PetID, time: Date) => {
	const delay = await getConfig('pet', 'notificationDelay', petID);

	if (delay) {
		await cancelPetFoodNotification(petID);

		await wrapTry(
			() =>
				triggerClient.sendEvent(
					{
						id: `pet-food-notification:${petID}`,
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
	}
};
