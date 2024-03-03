import { createId } from '@paralleldrive/cuid2';
import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { petFoodTable, petsTable } from './database/schema';
import { db } from './database/db';

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
