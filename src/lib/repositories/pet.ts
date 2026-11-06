import { createId } from '@paralleldrive/cuid2';
import { and, eq } from 'drizzle-orm';
import { Context, Effect, Layer } from 'effect';

import * as Database from '../database/db.js';
import {
	petCarersTable,
	petsTable,
	type PetCarerStatus,
	type UserID,
	usersTable,
} from '../database/schema.js';
import type { User } from './user.js';

const makePetRepository = Effect.gen(function* () {
	const db = yield* Database.Database;

	const getUserOwnedPets = db.makeQuery((execute, userID: UserID) =>
		execute((client) =>
			client
				.select({ id: petsTable.id, name: petsTable.name })
				.from(petsTable)
				.where(eq(petsTable.ownerID, userID))
				.all(),
		).pipe(Effect.withSpan('PetRepository.getUserOwnedPets')),
	);

	const getUserCaredPets = db.makeQuery((execute, userID: UserID) =>
		execute((client) =>
			client
				.select({
					id: petsTable.id,
					name: petsTable.name,
					ownerID: petsTable.ownerID,
				})
				.from(petCarersTable)
				.innerJoin(petsTable, eq(petCarersTable.petID, petsTable.id))
				.where(
					and(
						eq(petCarersTable.carerID, userID),
						eq(petCarersTable.status, 'accepted'),
					),
				)
				.all(),
		).pipe(Effect.withSpan('PetRepository.getUserCaredPets')),
	);

	const createPet = Effect.fn('PetRepository.createPet')(function* (
		name: string,
		ownerID: UserID,
	) {
		yield* db.execute((client) =>
			client
				.insert(petsTable)
				.values({
					id: createId() as typeof petsTable.$inferSelect.id,
					name,
					ownerID,
				})
				.run(),
		);
	});

	const deletePet = db.makeQuery(
		(execute, petID: typeof petsTable.$inferSelect.id) =>
			execute((client) =>
				client.delete(petsTable).where(eq(petsTable.id, petID)).run(),
			),
	);

	const getPetCarers = db.makeQuery(
		(execute, petID: typeof petCarersTable.$inferSelect.petID) =>
			execute((client) =>
				client
					.select({
						id: petCarersTable.id,
						status: petCarersTable.status,
						carer: usersTable,
					})
					.from(petCarersTable)
					.innerJoin(usersTable, eq(petCarersTable.carerID, usersTable.id))
					.where(eq(petCarersTable.petID, petID))
					.all(),
			),
	);

	const getPetCarerStatus = db.makeQuery(
		(
			execute,
			{
				petID,
				carerID,
			}: {
				petID: typeof petCarersTable.$inferSelect.petID;
				carerID: User['id'];
			},
		) =>
			execute((client) =>
				client
					.select({ status: petCarersTable.status })
					.from(petCarersTable)
					.where(
						and(
							eq(petCarersTable.petID, petID),
							eq(petCarersTable.carerID, carerID),
						),
					)
					.get(),
			),
	);

	const addCarer = Effect.fn('PetRepository.addCarer')(function* (
		petID: typeof petCarersTable.$inferSelect.petID,
		carerID: User['id'],
	) {
		yield* db.execute((client) =>
			client
				.insert(petCarersTable)
				.values({
					id: createId() as typeof petCarersTable.$inferSelect.id,
					petID,
					carerID,
				})
				.run(),
		);
	});

	const removeCarer = db.makeQuery(
		(
			execute,
			{
				petID,
				carerID,
			}: {
				petID: typeof petCarersTable.$inferSelect.petID;
				carerID: User['id'];
			},
		) =>
			execute((client) =>
				client
					.delete(petCarersTable)
					.where(
						and(
							eq(petCarersTable.petID, petID),
							eq(petCarersTable.carerID, carerID),
						),
					)
					.run(),
			),
	);

	const getPendingPetInvites = db.makeQuery((execute, carerID: User['id']) =>
		execute((client) =>
			client
				.select({
					id: petCarersTable.id,
					petName: petsTable.name,
					petOwner: usersTable,
				})
				.from(petCarersTable)
				.innerJoin(petsTable, eq(petCarersTable.petID, petsTable.id))
				.innerJoin(usersTable, eq(petsTable.ownerID, usersTable.id))
				.where(
					and(
						eq(petCarersTable.carerID, carerID),
						eq(petCarersTable.status, 'pending'),
					),
				)
				.all(),
		),
	);

	const answerPendingPetInvite = db.makeQuery(
		(
			execute,
			{
				inviteID,
				status,
			}: {
				inviteID: typeof petCarersTable.$inferSelect.id;
				status: Exclude<PetCarerStatus, 'pending'>;
			},
		) =>
			execute((client) =>
				client
					.update(petCarersTable)
					.set({ status })
					.where(eq(petCarersTable.id, inviteID))
					.run(),
			),
	);

	return {
		getUserOwnedPets,
		getUserCaredPets,
		createPet,
		deletePet,
		getPetCarers,
		getPetCarerStatus,
		addCarer,
		removeCarer,
		getPendingPetInvites,
		answerPendingPetInvite,
	} as const;
});

export class PetRepository extends Context.Service<
	PetRepository,
	Effect.Success<typeof makePetRepository>
>()('app/PetRepository') {
	declare readonly getUserOwnedPets: Effect.Success<
		typeof makePetRepository
	>['getUserOwnedPets'];
	declare readonly getUserCaredPets: Effect.Success<
		typeof makePetRepository
	>['getUserCaredPets'];
	declare readonly createPet: Effect.Success<
		typeof makePetRepository
	>['createPet'];
	declare readonly deletePet: Effect.Success<
		typeof makePetRepository
	>['deletePet'];
	declare readonly getPetCarers: Effect.Success<
		typeof makePetRepository
	>['getPetCarers'];
	declare readonly getPetCarerStatus: Effect.Success<
		typeof makePetRepository
	>['getPetCarerStatus'];
	declare readonly addCarer: Effect.Success<
		typeof makePetRepository
	>['addCarer'];
	declare readonly removeCarer: Effect.Success<
		typeof makePetRepository
	>['removeCarer'];
	declare readonly getPendingPetInvites: Effect.Success<
		typeof makePetRepository
	>['getPendingPetInvites'];
	declare readonly answerPendingPetInvite: Effect.Success<
		typeof makePetRepository
	>['answerPendingPetInvite'];

	static readonly layer = Layer.effect(this, makePetRepository).pipe(
		Layer.provide(Database.layer),
	);
}
