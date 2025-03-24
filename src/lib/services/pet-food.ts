import { DateTime, Duration, Effect, Either, Option, Struct } from 'effect';

import type Qty from 'js-quantities';

import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { type ConfigValue, getConfigEffect } from '../entities/config.js';
import { addPetFood, getLastPetFood } from '../entities/pet-food.js';
import type { Pet } from '../entities/pet.js';
import { petFoodNotificationJob } from '../queues/pet-food-notification.js';

const LIMIT_DURATION = Duration.decode('1 minutes');

const schedulePetFoodNotification = (
	petID: PetID,
	petFoodID: PetFoodID,
	time: DateTime.DateTime
) =>
	Effect.gen(function* () {
		const now = yield* DateTime.now;

		const notificationDelay = yield* getConfigEffect(
			'pet',
			'notificationDelay',
			petID
		);

		const delay = time.pipe(
			DateTime.add(notificationDelay),
			DateTime.distanceDuration(now),
			Duration.toMillis
		);

		yield* Effect.tryPromise(() =>
			petFoodNotificationJob.queue.add(
				`pet-${petID}}`,
				{
					petID
				},
				{
					jobId: petFoodID,
					delay: Math.max(delay, 0)
				}
			)
		).pipe(Effect.ignoreLogged);
	});

const cancelPetFoodNotification = (petFoodID: PetFoodID) =>
	Effect.tryPromise(() => petFoodNotificationJob.queue.remove(petFoodID)).pipe(
		Effect.ignoreLogged
	);

type Params = {
	pet: Pick<Pet, 'id' | 'name'>;
	messageID: number;
	userID: UserID;

	time: DateTime.DateTime;
	timeChanged: boolean;
	quantity: Qty;

	dayStart: ConfigValue<'pet', 'dayStart'>;
};

const addPetFoodAndScheduleNotification = ({
	pet,
	messageID,
	userID,

	timeChanged,
	time,
	quantity,

	dayStart
}: Params) =>
	Effect.gen(function* () {
		const lastPetFood = yield* Effect.tryPromise(() =>
			getLastPetFood(pet.id)
		).pipe(Effect.map(Option.fromNullable));

		const lastPetFoodTime = lastPetFood.pipe(
			Option.map(Struct.get('time')),
			Option.andThen(DateTime.make)
		);

		const shouldIgnoreEntry = lastPetFoodTime.pipe(
			Option.andThen(DateTime.distanceDuration(time)),
			Option.andThen(Duration.lessThanOrEqualTo(LIMIT_DURATION)),
			Option.getOrElse(() => false)
		);

		if (shouldIgnoreEntry) {
			return Either.left(
				`Já foi colocado ração há menos de ${Duration.format(LIMIT_DURATION)}. Ignorando entrada.`
			);
		}

		const petFood = yield* Effect.tryPromise(() =>
			addPetFood({
				petID: pet.id,
				messageID,
				userID,

				quantity: quantity.scalar,
				time: DateTime.toDate(time)
			})
		);

		const message = [
			`Foram adicionados ${quantity} de ração para o pet ${pet.name}.`,
			timeChanged &&
				`A ração foi adicionada para ${DateTime.format(DateTime.unsafeSetZoneNamed(time, dayStart.timezone), { locale: 'pt-BR' })}`
		]
			.filter(Boolean)
			.join(' ');

		if (
			Option.isNone(lastPetFoodTime) ||
			DateTime.greaterThan(time, lastPetFoodTime.value)
		) {
			if (Option.isSome(lastPetFood)) {
				yield* cancelPetFoodNotification(lastPetFood.value.id);
			}

			yield* schedulePetFoodNotification(pet.id, petFood.id, time);
		}

		return Either.right({ message });
	});

export const petFoodService = {
	addPetFoodAndScheduleNotification,
	schedulePetFoodNotification,
	cancelPetFoodNotification
};
