import { and, eq } from 'drizzle-orm';
import { Context, Effect, Layer } from 'effect';

import * as Database from '../database/db.js';
import { petCarersTable, petsTable, type UserID } from '../database/schema.js';

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

	return { getUserOwnedPets, getUserCaredPets } as const;
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

	static readonly layer = Layer.effect(this, makePetRepository).pipe(
		Layer.provide(Database.layer),
	);
}
