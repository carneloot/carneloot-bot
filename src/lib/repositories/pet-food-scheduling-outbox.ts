import { createId } from '@paralleldrive/cuid2';
import { asc, eq } from 'drizzle-orm';
import { Context, Effect, Layer } from 'effect';

import * as Database from '../database/db.js';
import {
	type PetFoodID,
	type PetFoodSchedulingOutboxID,
	petFoodSchedulingOutboxTable,
	type PetID,
} from '../database/schema.js';

type SchedulingIntent =
	| { readonly action: 'remove'; readonly petFoodID: PetFoodID }
	| {
			readonly action: 'schedule';
			readonly petFoodID: PetFoodID;
			readonly petID: PetID;
			readonly runAt: Date;
	  };

const makePetFoodSchedulingOutboxRepository = Effect.gen(function* () {
	const db = yield* Database.Database;

	const enqueue = Effect.fn('PetFoodSchedulingOutboxRepository.enqueue')(
		function* (intent: SchedulingIntent, tx?: Database.Transaction) {
			yield* (tx ?? db.execute)((client) =>
				client.insert(petFoodSchedulingOutboxTable).values({
					id: createId() as PetFoodSchedulingOutboxID,
					...intent,
					createdAt: new Date(),
				}),
			);
		},
	);

	const getPending = db.makeQuery((execute) =>
		execute((client) =>
			client
				.select()
				.from(petFoodSchedulingOutboxTable)
				.orderBy(asc(petFoodSchedulingOutboxTable.createdAt))
				.all(),
		),
	);

	const remove = db.makeQuery((execute, id: PetFoodSchedulingOutboxID) =>
		execute((client) =>
			client
				.delete(petFoodSchedulingOutboxTable)
				.where(eq(petFoodSchedulingOutboxTable.id, id)),
		).pipe(Effect.asVoid),
	);

	return { enqueue, getPending, remove } as const;
});

export class PetFoodSchedulingOutboxRepository extends Context.Service<
	PetFoodSchedulingOutboxRepository,
	Effect.Success<typeof makePetFoodSchedulingOutboxRepository>
>()('PetFoodSchedulingOutboxRepository') {
	declare readonly enqueue: Effect.Success<
		typeof makePetFoodSchedulingOutboxRepository
	>['enqueue'];
	declare readonly getPending: Effect.Success<
		typeof makePetFoodSchedulingOutboxRepository
	>['getPending'];
	declare readonly remove: Effect.Success<
		typeof makePetFoodSchedulingOutboxRepository
	>['remove'];

	static readonly layer = Layer.effect(
		this,
		makePetFoodSchedulingOutboxRepository,
	);
}
