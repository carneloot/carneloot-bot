import { Data, DateTime, Duration, Effect, Option, Struct } from 'effect';

import type Qty from 'js-quantities';

import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
import type { Pet } from '../entities/pet.js';
import { PetFoodNotificationQueue } from '../queues/pet-food-notification.js';
import { PetFoodRepository } from '../repositories/pet-food.js';

const LIMIT_DURATION = Duration.decode('1 minutes');

type AddPetFoodAndScheduleNotificationParams = {
	pet: Pick<Pet, 'id' | 'name'>;
	messageID: number;
	userID: UserID;

	time: DateTime.DateTime;
	timeChanged: boolean;
	quantity: Qty;

	dayStart: ConfigValue<'pet', 'dayStart'>;
};

export class DuplicatedEntryError extends Data.TaggedError(
	'DuplicatedEntryError'
)<{ message: string }> {}

export class PetFoodService extends Effect.Service<PetFoodService>()(
	'app/PetFoodService',
	{
		dependencies: [
			ConfigService.Default,
			PetFoodRepository.Default,
			PetFoodNotificationQueue.Default
		],
		effect: Effect.gen(function* () {
			const petFoodRepository = yield* PetFoodRepository;
			const config = yield* ConfigService;
			const queue = yield* PetFoodNotificationQueue;

			const schedulePetFoodNotification = Effect.fn(
				'PetFoodService.schedulePetFoodNotification'
			)(function* (
				petID: PetID,
				petFoodID: PetFoodID,
				time: DateTime.DateTime
			) {
				const notificationDelay = yield* config.getConfig(
					'pet',
					'notificationDelay',
					petID
				);

				yield* queue.scheduleJob(
					petFoodID,
					{ petID },
					DateTime.addDuration(time, notificationDelay)
				);
			});

			const addPetFoodAndScheduleNotification = Effect.fn(
				'PetFoodService.addPetFoodAndScheduleNotification'
			)(function* ({
				pet,
				messageID,
				userID,

				timeChanged,
				time,
				quantity,

				dayStart
			}: AddPetFoodAndScheduleNotificationParams) {
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
					return yield* new DuplicatedEntryError({
						message: `Já foi colocado ração há menos de ${Duration.format(LIMIT_DURATION)}. Ignorando entrada.`
					});
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
						yield* queue.removeFromQueue(lastPetFood.value.id);
					}

					yield* schedulePetFoodNotification(pet.id, petFood.id, time);
				}

				return { message };
			});

			return {
				addPetFoodAndScheduleNotification,
				schedulePetFoodNotification
			} as const;
		})
	}
) {}
