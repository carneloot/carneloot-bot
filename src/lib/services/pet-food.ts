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
import * as Database from '../database/db.js';
import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
import { PetFoodSchedulingOutboxRepository } from '../repositories/pet-food-scheduling-outbox.js';
import { PetFoodRepository } from '../repositories/pet-food.js';
import type { Pet } from '../repositories/pet.js';
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

export const reconcilePetFoodSchedulingOutbox = Effect.fn(
	'PetFoodService.reconcileNotifications',
)(function* () {
	const outbox = yield* PetFoodSchedulingOutboxRepository;
	const queue = yield* PetFoodNotificationQueue;
	const intents = yield* outbox.getPending(undefined);

	yield* Effect.forEach(intents, (intent) =>
		Effect.gen(function* () {
			if (intent.action === 'remove') {
				yield* queue.removeFromQueue(intent.petFoodID);
			} else {
				if (intent.petID === null || intent.runAt === null) {
					return yield* Effect.die('Invalid pet food scheduling intent');
				}

				yield* queue.removeFromQueue(intent.petFoodID);
				yield* queue.scheduleJob(
					intent.petFoodID,
					{ petID: intent.petID },
					DateTime.makeUnsafe(intent.runAt),
				);
			}

			yield* outbox.remove(intent.id);
		}),
	);
});

const makePetFoodService = Effect.gen(function* () {
	const petFoodRepository = yield* PetFoodRepository;
	const outbox = yield* PetFoodSchedulingOutboxRepository;
	const config = yield* ConfigService;
	const db = yield* Database.Database;

	const enqueueSchedule = (
		petID: PetID,
		petFoodID: PetFoodID,
		time: DateTime.DateTime,
		delay: Duration.Duration,
		tx: Database.Transaction,
	) =>
		outbox.enqueue(
			{
				action: 'schedule',
				petID,
				petFoodID,
				runAt: DateTime.toDate(DateTime.addDuration(time, delay)),
			},
			tx,
		);

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

		const notificationDelay = yield* config
			.getConfig('pet', 'notificationDelay', pet.id)
			.pipe(Effect.option);

		yield* db.transaction((tx) =>
			Effect.gen(function* () {
				const petFood = yield* petFoodRepository.addPetFood(
					{
						petID: pet.id,
						messageID,
						userID,

						quantity: quantity.scalar,
						time: DateTime.toDate(time),
					},
					tx,
				);

				if (
					(Option.isNone(lastPetFoodTime) ||
						DateTime.isGreaterThan(time, lastPetFoodTime.value)) &&
					Option.isSome(notificationDelay)
				) {
					if (Option.isSome(lastPetFood)) {
						yield* outbox.enqueue(
							{ action: 'remove', petFoodID: lastPetFood.value.id },
							tx,
						);
					}

					yield* enqueueSchedule(
						pet.id,
						petFood.id,
						time,
						notificationDelay.value,
						tx,
					);
				}

				return petFood;
			}),
		);

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

		yield* reconcilePetFoodSchedulingOutbox();

		return { message };
	});

	const rescheduleLastPetFoodNotification = Effect.fn(
		'PetFoodService.rescheduleLastPetFoodNotification',
	)(function* (petID: PetID) {
		const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });

		if (Option.isSome(lastPetFood)) {
			const notificationDelay = yield* config.getConfig(
				'pet',
				'notificationDelay',
				petID,
			);
			yield* db.transaction((tx) =>
				Effect.gen(function* () {
					yield* enqueueSchedule(
						petID,
						lastPetFood.value.id,
						DateTime.makeUnsafe(lastPetFood.value.time),
						notificationDelay,
						tx,
					);
				}),
			);
			yield* reconcilePetFoodSchedulingOutbox();
		}
	});

	const setNotificationDelayAndReschedule = Effect.fn(
		'PetFoodService.setNotificationDelayAndReschedule',
	)(function* (petID: PetID, delay: ConfigValue<'pet', 'notificationDelay'>) {
		const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
		yield* db.transaction((tx) =>
			Effect.gen(function* () {
				yield* config.setConfig('pet', 'notificationDelay', petID, delay, tx);
				if (Option.isSome(lastPetFood)) {
					yield* enqueueSchedule(
						petID,
						lastPetFood.value.id,
						DateTime.makeUnsafe(lastPetFood.value.time),
						delay,
						tx,
					);
				}
			}),
		);
		yield* reconcilePetFoodSchedulingOutbox();
	});

	const disableNotification = Effect.fn('PetFoodService.disableNotification')(
		function* (petID: PetID) {
			const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
			yield* db.transaction((tx) =>
				Effect.gen(function* () {
					yield* config.deleteConfig('pet', 'notificationDelay', petID, tx);
					if (Option.isSome(lastPetFood)) {
						yield* outbox.enqueue(
							{ action: 'remove', petFoodID: lastPetFood.value.id },
							tx,
						);
					}
				}),
			);
			yield* reconcilePetFoodSchedulingOutbox();
		},
	);

	const deletePetFoodAndNotification = Effect.fn(
		'PetFoodService.deletePetFoodAndNotification',
	)(function* (petFoodID: PetFoodID) {
		yield* db.transaction((tx) =>
			Effect.gen(function* () {
				yield* petFoodRepository.deletePetFood(petFoodID, tx);
				yield* outbox.enqueue({ action: 'remove', petFoodID }, tx);
			}),
		);
		yield* reconcilePetFoodSchedulingOutbox();
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
		const notificationDelay = yield* config
			.getConfig('pet', 'notificationDelay', petID)
			.pipe(Effect.option);
		yield* db.transaction((tx) =>
			Effect.gen(function* () {
				yield* petFoodRepository.updatePetFood(
					{ petFoodID, values: { quantity, time } },
					tx,
				);

				const lastPetFood = yield* petFoodRepository.getLastPetFood(
					{ petID },
					tx,
				);
				if (
					timeChanged &&
					Option.isSome(lastPetFood) &&
					lastPetFood.value.id === petFoodID &&
					Option.isSome(notificationDelay)
				) {
					yield* enqueueSchedule(
						petID,
						petFoodID,
						DateTime.makeUnsafe(time),
						notificationDelay.value,
						tx,
					);
				}
			}),
		);
		yield* reconcilePetFoodSchedulingOutbox();
	});

	return {
		addPetFoodAndScheduleNotification,
		rescheduleLastPetFoodNotification,
		setNotificationDelayAndReschedule,
		disableNotification,
		deletePetFoodAndNotification,
		updatePetFoodAndNotification,
		reconcileNotifications: reconcilePetFoodSchedulingOutbox,
	} as const;
});

export class PetFoodService extends Context.Service<
	PetFoodService,
	Effect.Success<typeof makePetFoodService>
>()('app/PetFoodService') {
	declare readonly addPetFoodAndScheduleNotification: Effect.Success<
		typeof makePetFoodService
	>['addPetFoodAndScheduleNotification'];
	declare readonly rescheduleLastPetFoodNotification: Effect.Success<
		typeof makePetFoodService
	>['rescheduleLastPetFoodNotification'];
	declare readonly setNotificationDelayAndReschedule: Effect.Success<
		typeof makePetFoodService
	>['setNotificationDelayAndReschedule'];
	declare readonly disableNotification: Effect.Success<
		typeof makePetFoodService
	>['disableNotification'];
	declare readonly deletePetFoodAndNotification: Effect.Success<
		typeof makePetFoodService
	>['deletePetFoodAndNotification'];
	declare readonly updatePetFoodAndNotification: Effect.Success<
		typeof makePetFoodService
	>['updatePetFoodAndNotification'];
	declare readonly reconcileNotifications: Effect.Success<
		typeof makePetFoodService
	>['reconcileNotifications'];

	static readonly layer = Layer.effect(this, makePetFoodService);
}
