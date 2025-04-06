import { DateTime, Duration, Effect, Either, Option, Struct } from 'effect';

import type Qty from 'js-quantities';

import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
import type { Pet } from '../entities/pet.js';
import { petFoodNotificationJob } from '../queues/pet-food-notification.js';
import { PetFoodRepository } from '../repositories/pet-food.js';

const LIMIT_DURATION = Duration.decode('1 minutes');

const schedulePetFoodNotification = (
	petID: PetID,
	petFoodID: PetFoodID,
	time: DateTime.DateTime
) =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const notificationDelay = yield* config.getConfig(
			'pet',
			'notificationDelay',
			petID
		);

		const delay = time.pipe(
			DateTime.addDuration(notificationDelay),
			DateTime.distanceDuration(DateTime.unsafeNow()),
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
		).pipe(Effect.withSpan('schedulePetFoodNotification'), Effect.ignoreLogged);
	});

const cancelPetFoodNotification = (petFoodID: PetFoodID) =>
	Effect.tryPromise(() => petFoodNotificationJob.queue.remove(petFoodID)).pipe(
		Effect.withSpan('cancelPetFoodNotification'),
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
		const petFoodRepository = yield* PetFoodRepository;

		const lastPetFood = yield* petFoodRepository.getLastPetFood({
			petID: pet.id
		});

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

		const petFood = yield* petFoodRepository.addPetFood({
			petID: pet.id,
			messageID,
			userID,

			quantity: quantity.scalar,
			time: DateTime.toDate(time)
		});

		const formattedDate = time.pipe(
			DateTime.unsafeSetZoneNamed(dayStart.timezone),
			DateTime.format({
				locale: 'pt-BR',
				timeStyle: 'short',
				dateStyle: 'short'
			})
		);

		const message = [
			`Foram adicionados ${quantity} de ração para o pet ${pet.name}.`,
			timeChanged && `A ração foi adicionada para ${formattedDate}`
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
	}).pipe(Effect.withSpan('addPetFoodAndScheduleNotification'));

export const petFoodService = {
	addPetFoodAndScheduleNotification,
	schedulePetFoodNotification,
	cancelPetFoodNotification
};
