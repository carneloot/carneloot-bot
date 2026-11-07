import { createId } from '@paralleldrive/cuid2';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { Context, DateTime, Effect, Layer, Option } from 'effect';

import * as Database from '../database/db.js';
import {
	type PetFoodID,
	type PetID,
	petFoodTable,
	petsTable,
	usersTable,
} from '../database/schema.js';

const makePetFoodRepository = Effect.gen(function* () {
	const db = yield* Database.Database;

	const getDailyFoodConsumption = db.makeQuery(
		(
			execute,
			input: {
				petID: PetID;
				from: DateTime.DateTime;
				to: DateTime.DateTime;
			},
		) =>
			execute((db) =>
				db
					.select({
						id: petsTable.id,
						name: petsTable.name,
						total: sql<number>`sum(${petFoodTable.quantity})`,
						lastTime: sql<number>`max(${petFoodTable.time})`,
					})
					.from(petFoodTable)
					.innerJoin(petsTable, eq(petFoodTable.petID, petsTable.id))
					.where(
						and(
							eq(petFoodTable.petID, input.petID),
							gte(petFoodTable.time, DateTime.toDate(input.from)),
							lt(petFoodTable.time, DateTime.toDate(input.to)),
						),
					)
					.groupBy(petsTable.id)
					.get()
					.then(Option.fromNullishOr),
			).pipe(Effect.withSpan('getDailyFoodConsumption')),
	);

	const addPetFood = db.makeQuery(
		(execute, values: Omit<typeof petFoodTable.$inferInsert, 'id'>) =>
			execute((db) =>
				db
					.insert(petFoodTable)
					.values({
						id: createId() as PetFoodID,
						...values,
					})
					.returning({
						id: petFoodTable.id,
					})
					.get(),
			).pipe(Effect.withSpan('addPetFood', { attributes: { input: values } })),
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
				.then(Option.fromNullishOr),
		).pipe(Effect.withSpan('getLastPetFood')),
	);

	const getPetFoodByRange = db.makeQuery(
		(
			execute,
			input: { petID: PetID; from: DateTime.DateTime; to: DateTime.DateTime },
		) =>
			execute((db) =>
				db
					.select({
						id: petFoodTable.id,
						quantity: petFoodTable.quantity,
						time: petFoodTable.time,
						user: {
							id: usersTable.id,
							telegramID: usersTable.telegramID,
							username: usersTable.username,
							firstName: usersTable.firstName,
							lastName: usersTable.lastName,
						},
					})
					.from(petFoodTable)
					.innerJoin(usersTable, eq(petFoodTable.userID, usersTable.id))
					.where(
						and(
							eq(petFoodTable.petID, input.petID),
							gte(petFoodTable.time, DateTime.toDate(input.from)),
							lte(petFoodTable.time, DateTime.toDate(input.to)),
						),
					)
					.orderBy(asc(petFoodTable.time))
					.all(),
			).pipe(Effect.withSpan('PetFoodRepository.getPetFoodByRange')),
	);

	const deletePetFood = db.makeQuery((execute, petFoodID: PetFoodID) =>
		execute((db) =>
			db.delete(petFoodTable).where(eq(petFoodTable.id, petFoodID)).run(),
		).pipe(Effect.withSpan('PetFoodRepository.deletePetFood')),
	);

	const getPetFoodsFromMessage = db.makeQuery(
		(execute, input: { messageId: number }) =>
			execute((db) =>
				db
					.select({
						id: petFoodTable.id,
						time: petFoodTable.time,
						petID: petFoodTable.petID,
					})
					.from(petFoodTable)
					.where(eq(petFoodTable.messageID, input.messageId)),
			).pipe(
				Effect.withSpan('getPetFoodsFromMessage', {
					attributes: { input },
				}),
			),
	);

	const updatePetFood = db.makeQuery(
		(
			execute,
			input: {
				petFoodID: PetFoodID;
				values: Pick<
					typeof petFoodTable.$inferInsert,
					'time' | 'messageID' | 'quantity'
				>;
			},
		) =>
			execute((db) =>
				db
					.update(petFoodTable)
					.set(input.values)
					.where(eq(petFoodTable.id, input.petFoodID)),
			).pipe(Effect.withSpan('updatePetFood')),
	);

	return {
		getDailyFoodConsumption,
		getLastPetFood,
		getPetFoodByRange,
		deletePetFood,
		addPetFood,
		getPetFoodsFromMessage,
		updatePetFood,
	} as const;
});

export class PetFoodRepository extends Context.Service<
	PetFoodRepository,
	Effect.Success<typeof makePetFoodRepository>
>()('PetFoodRepository') {
	declare readonly getDailyFoodConsumption: Effect.Success<
		typeof makePetFoodRepository
	>['getDailyFoodConsumption'];
	declare readonly getLastPetFood: Effect.Success<
		typeof makePetFoodRepository
	>['getLastPetFood'];
	declare readonly getPetFoodByRange: Effect.Success<
		typeof makePetFoodRepository
	>['getPetFoodByRange'];
	declare readonly deletePetFood: Effect.Success<
		typeof makePetFoodRepository
	>['deletePetFood'];
	declare readonly addPetFood: Effect.Success<
		typeof makePetFoodRepository
	>['addPetFood'];
	declare readonly getPetFoodsFromMessage: Effect.Success<
		typeof makePetFoodRepository
	>['getPetFoodsFromMessage'];
	declare readonly updatePetFood: Effect.Success<
		typeof makePetFoodRepository
	>['updatePetFood'];

	static readonly layer = Layer.effect(this, makePetFoodRepository).pipe(
		Layer.provide(Database.layer),
	);
}
