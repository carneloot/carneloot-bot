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

import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
import type { Pet } from '../entities/pet.js';
import { PetFoodNotificationQueue } from '../queues/pet-food-notification.js';
import { PetFoodRepository } from '../repositories/pet-food.js';
import { isDuplicatePetFoodEntry } from './is-duplicate-pet-food-entry.js';

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
			Option.map((lastPetFoodTime) =>
				isDuplicatePetFoodEntry(lastPetFoodTime, time),
			),
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

	return {
		addPetFoodAndScheduleNotification,
		schedulePetFoodNotification,
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

	static readonly layer = Layer.effect(this, makePetFoodService).pipe(
		Layer.provide(PetFoodNotificationQueue.layer),
		Layer.provide(PetFoodRepository.layer),
		Layer.provide(ConfigService.layer),
	);
}
