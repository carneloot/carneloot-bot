import { createId } from '@paralleldrive/cuid2';

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { DateTime, Effect, Option } from 'effect';

import * as Database from '../database/db.js';
import {
	type PetFoodID,
	type PetID,
	petFoodTable,
	petsTable
} from '../database/schema.js';

export class PetFoodRepository extends Effect.Service<PetFoodRepository>()(
	'PetFoodRepository',
	{
		dependencies: [Database.layer],
		effect: Effect.gen(function* () {
			const db = yield* Database.Database;

			const getDailyFoodConsumption = db.makeQuery(
				(
					execute,
					input: {
						petID: PetID;
						from: DateTime.DateTime;
						to: DateTime.DateTime;
					}
				) =>
					execute((db) =>
						db
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
									eq(petFoodTable.petID, input.petID),
									gte(petFoodTable.time, DateTime.toDate(input.from)),
									lt(petFoodTable.time, DateTime.toDate(input.to))
								)
							)
							.groupBy(petsTable.id)
							.get()
							.then(Option.fromNullable)
					).pipe(Effect.withSpan('getDailyFoodConsumption'))
			);

			const addPetFood = db.makeQuery(
				(execute, values: Omit<typeof petFoodTable.$inferInsert, 'id'>) =>
					execute((db) =>
						db
							.insert(petFoodTable)
							.values({
								id: createId() as PetFoodID,
								...values
							})
							.returning({
								id: petFoodTable.id
							})
							.get()
					).pipe(Effect.withSpan('addPetFood'))
			);
			const getLastPetFood = db.makeQuery((execute, input: { petID: PetID }) =>
				execute((db) =>
					db
						.select({ id: petFoodTable.id, time: petFoodTable.time })
						.from(petFoodTable)
						.where(eq(petFoodTable.petID, input.petID))
						.orderBy(desc(petFoodTable.time))
						.limit(1)
						.get()
						.then(Option.fromNullable)
				).pipe(Effect.withSpan('getLastPetFood'))
			);

			return {
				getDailyFoodConsumption,
				getLastPetFood,
				addPetFood
			} as const;
		})
	}
) {}
