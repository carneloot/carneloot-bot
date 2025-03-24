import { DateTime, Effect, Option } from 'effect';
import { and, eq, gte, lt, sql } from 'drizzle-orm';

import * as Database from '../database/db.js';
import { type PetID, petFoodTable, petsTable } from '../database/schema.js';

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
					execute((client) =>
						client
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
					)
			);

			return {
				getDailyFoodConsumption
			} as const;
		})
	}
) {}
