import {
	Context,
	Data,
	DateTime,
	Duration,
	Effect,
	Layer,
	Option,
	Struct,
} from 'effect';
import type Qty from 'js-quantities';

import { PetFoodNotificationQueue } from '../../adapters/queue/pet-food-notification.js';
import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
import { PetFoodRepository } from '../repositories/pet-food.js';
import type { Pet } from '../repositories/pet.js';

const LIMIT_DURATION = Duration.fromInputUnsafe('1 minutes');

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
	'DuplicatedEntryError',
)<{ message: string }> {}

const makePetFoodService = Effect.gen(function* () {
	const petFoodRepository = yield* PetFoodRepository;
	const config = yield* ConfigService;
	const queue = yield* PetFoodNotificationQueue;

	const schedulePetFoodNotification = Effect.fn(
		'PetFoodService.schedulePetFoodNotification',
	)(function* (petID: PetID, petFoodID: PetFoodID, time: DateTime.DateTime) {
		const notificationDelay = yield* config.getConfig(
			'pet',
			'notificationDelay',
			petID,
		);

		yield* queue.scheduleJob(
			petFoodID,
			{ petID },
			DateTime.addDuration(time, notificationDelay),
		);
	});

	const addPetFoodAndScheduleNotification = Effect.fn(
		'PetFoodService.addPetFoodAndScheduleNotification',
	)(function* ({
		pet,
		messageID,
		userID,

		timeChanged,
		time,
		quantity,

		dayStart,
	}: AddPetFoodAndScheduleNotificationParams) {
		const lastPetFood = yield* petFoodRepository.getLastPetFood({
			petID: pet.id,
		});

		const lastPetFoodTime = lastPetFood.pipe(
			Option.map(Struct.get('time')),
			Option.andThen(DateTime.make),
		);

		const shouldIgnoreEntry = lastPetFoodTime.pipe(
			Option.andThen(DateTime.distance(time)),
			Option.andThen(Duration.isLessThanOrEqualTo(LIMIT_DURATION)),
			Option.getOrElse(() => false),
		);

		if (shouldIgnoreEntry) {
			return yield* new DuplicatedEntryError({
				message: `Já foi colocado ração há menos de ${Duration.format(LIMIT_DURATION)}. Ignorando entrada.`,
			});
		}

		const petFood = yield* petFoodRepository.addPetFood({
			petID: pet.id,
			messageID,
			userID,

			quantity: quantity.scalar,
			time: DateTime.toDate(time),
		});

		const formattedDate = time.pipe(
			DateTime.setZoneNamedUnsafe(dayStart.timezone),
			DateTime.format({
				locale: 'pt-BR',
				timeStyle: 'short',
				dateStyle: 'short',
			}),
		);

		const message = [
			`Foram adicionados ${quantity} de ração para o pet ${pet.name}.`,
			timeChanged && `A ração foi adicionada para ${formattedDate}`,
		]
			.filter(Boolean)
			.join(' ');

		if (
			Option.isNone(lastPetFoodTime) ||
			DateTime.isGreaterThan(time, lastPetFoodTime.value)
		) {
			if (Option.isSome(lastPetFood)) {
				yield* queue.removeFromQueue(lastPetFood.value.id);
			}

			yield* schedulePetFoodNotification(pet.id, petFood.id, time);
		}

		return { message };
	});

	const rescheduleLastPetFoodNotification = Effect.fn(
		'PetFoodService.rescheduleLastPetFoodNotification',
	)(function* (petID: PetID) {
		const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });

		if (Option.isSome(lastPetFood)) {
			yield* queue.removeFromQueue(lastPetFood.value.id);
			yield* schedulePetFoodNotification(
				petID,
				lastPetFood.value.id,
				DateTime.makeUnsafe(lastPetFood.value.time),
			);
		}
	});

	const disableNotification = Effect.fn('PetFoodService.disableNotification')(
		function* (petID: PetID) {
			yield* config.deleteConfig('pet', 'notificationDelay', petID);
			const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
			if (Option.isSome(lastPetFood)) {
				yield* queue.removeFromQueue(lastPetFood.value.id);
			}
		},
	);

	const deletePetFoodAndNotification = Effect.fn(
		'PetFoodService.deletePetFoodAndNotification',
	)(function* (petFoodID: PetFoodID) {
		yield* petFoodRepository.deletePetFood(petFoodID);
		yield* queue.removeFromQueue(petFoodID);
	});

	const updatePetFoodAndNotification = Effect.fn(
		'PetFoodService.updatePetFoodAndNotification',
	)(function* (
		petID: PetID,
		petFoodID: PetFoodID,
		quantity: number,
		time: Date,
		timeChanged: boolean,
	) {
		yield* petFoodRepository.updatePetFood({
			petFoodID,
			values: { quantity, time },
		});

		const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
		if (
			timeChanged &&
			Option.isSome(lastPetFood) &&
			lastPetFood.value.id === petFoodID
		) {
			yield* rescheduleLastPetFoodNotification(petID);
		}
	});

	return {
		addPetFoodAndScheduleNotification,
		schedulePetFoodNotification,
		rescheduleLastPetFoodNotification,
		disableNotification,
		deletePetFoodAndNotification,
		updatePetFoodAndNotification,
	} as const;
});

export class PetFoodService extends Context.Service<
	PetFoodService,
	Effect.Success<typeof makePetFoodService>
>()('app/PetFoodService') {
	declare readonly addPetFoodAndScheduleNotification: Effect.Success<
		typeof makePetFoodService
	>['addPetFoodAndScheduleNotification'];
	declare readonly schedulePetFoodNotification: Effect.Success<
		typeof makePetFoodService
	>['schedulePetFoodNotification'];
	declare readonly rescheduleLastPetFoodNotification: Effect.Success<
		typeof makePetFoodService
	>['rescheduleLastPetFoodNotification'];
	declare readonly disableNotification: Effect.Success<
		typeof makePetFoodService
	>['disableNotification'];
	declare readonly deletePetFoodAndNotification: Effect.Success<
		typeof makePetFoodService
	>['deletePetFoodAndNotification'];
	declare readonly updatePetFoodAndNotification: Effect.Success<
		typeof makePetFoodService
	>['updatePetFoodAndNotification'];

	static readonly layer = Layer.effect(this, makePetFoodService).pipe(
		Layer.provide(PetFoodNotificationQueue.layer),
		Layer.provide(PetFoodRepository.layer),
		Layer.provide(ConfigService.layer),
	);
}
