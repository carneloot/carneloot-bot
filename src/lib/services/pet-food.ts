import {
	Context,
	Data,
	DateTime,
	Duration,
	Effect,
	Layer,
	Option,
	Semaphore,
	Struct,
} from 'effect';
import type Qty from 'js-quantities';

import { PetFoodNotificationQueue } from '../../adapters/queue/pet-food-notification.js';
import * as Database from '../database/db.js';
import type { PetFoodID, PetID, UserID } from '../database/schema.js';
import { ConfigService, type ConfigValue } from '../entities/config.js';
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

const makePetFoodService = Effect.gen(function* () {
	const petFoodRepository = yield* PetFoodRepository;
	const config = yield* ConfigService;
	const db = yield* Database.Database;
	const queue = yield* PetFoodNotificationQueue;
	const updates = Semaphore.makeUnsafe(1);

	const updateReminder = Effect.fn('PetFoodService.updateReminder')(
		(operation: Effect.Effect<unknown, unknown>, warning: string) =>
			operation.pipe(
				Effect.as(null),
				Effect.catch((error) =>
					Effect.logError(warning, error).pipe(Effect.as(warning)),
				),
			),
	);

	const scheduleReminder = Effect.fn('PetFoodService.scheduleReminder')(
		function* (
			petID: PetID,
			petFoodID: PetFoodID,
			time: DateTime.DateTime,
			delay: Duration.Duration,
		) {
			yield* queue.removeFromQueue(petFoodID);
			yield* queue.scheduleJob(
				petFoodID,
				{ petID },
				DateTime.addDuration(time, delay),
			);
		},
	);

	const addPetFoodAndScheduleNotification = Effect.fn(
		'PetFoodService.addPetFoodAndScheduleNotification',
	)(
		function* ({
			pet,
			messageID,
			userID,
			timeChanged,
			time,
			quantity,
			dayStart,
		}: AddPetFoodAndScheduleNotificationParams) {
			const notificationDelay = yield* config
				.getConfig('pet', 'notificationDelay', pet.id)
				.pipe(Effect.option);

			const { petFood, lastPetFood, lastPetFoodTime } = yield* db.transaction(
				(tx) =>
					Effect.gen(function* () {
						const lastPetFood = yield* petFoodRepository.getLastPetFood(
							{ petID: pet.id },
							tx,
						);
						const lastPetFoodTime = lastPetFood.pipe(
							Option.map(Struct.get('time')),
							Option.andThen(DateTime.make),
						);
						if (
							Option.isSome(lastPetFoodTime) &&
							isDuplicatePetFoodEntry(lastPetFoodTime.value, time)
						) {
							return yield* new DuplicatedEntryError({
								message: `Já foi colocado ração há menos de ${Duration.format(LIMIT_DURATION)}. Ignorando entrada.`,
							});
						}
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
						return { petFood, lastPetFood, lastPetFoodTime };
					}),
			);

			let warning: string | null = null;
			if (
				(Option.isNone(lastPetFoodTime) ||
					DateTime.isGreaterThan(time, lastPetFoodTime.value)) &&
				Option.isSome(notificationDelay)
			) {
				warning = yield* updateReminder(
					Effect.gen(function* () {
						if (Option.isSome(lastPetFood)) {
							yield* queue.removeFromQueue(lastPetFood.value.id);
						}
						yield* scheduleReminder(
							pet.id,
							petFood.id,
							time,
							notificationDelay.value,
						);
					}),
					`A ração foi salva para ${pet.name}, mas não foi possível atualizar o lembrete. O lembrete pode estar incorreto. Não envie a ração novamente.`,
				);
			}

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
				warning,
			]
				.filter(Boolean)
				.join(' ');
			return { message, warning };
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	const rescheduleLastPetFoodNotification = Effect.fn(
		'PetFoodService.rescheduleLastPetFoodNotification',
	)(
		function* (petID: PetID) {
			const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
			if (Option.isNone(lastPetFood)) return null;
			const delay = yield* config.getConfig('pet', 'notificationDelay', petID);
			return yield* updateReminder(
				scheduleReminder(
					petID,
					lastPetFood.value.id,
					DateTime.makeUnsafe(lastPetFood.value.time),
					delay,
				),
				'Não foi possível atualizar o lembrete. Configure o atraso de notificação novamente para tentar atualizar o lembrete.',
			);
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	const setNotificationDelayAndReschedule = Effect.fn(
		'PetFoodService.setNotificationDelayAndReschedule',
	)(
		function* (petID: PetID, delay: ConfigValue<'pet', 'notificationDelay'>) {
			yield* config.setConfig('pet', 'notificationDelay', petID, delay);
			const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
			if (Option.isNone(lastPetFood)) return null;
			return yield* updateReminder(
				scheduleReminder(
					petID,
					lastPetFood.value.id,
					DateTime.makeUnsafe(lastPetFood.value.time),
					delay,
				),
				'O atraso de notificação foi salvo, mas não foi possível atualizar o lembrete. Configure o atraso novamente para tentar atualizar o lembrete.',
			);
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	const disableNotification = Effect.fn('PetFoodService.disableNotification')(
		function* (petID: PetID) {
			yield* config.deleteConfig('pet', 'notificationDelay', petID);
			const lastPetFood = yield* petFoodRepository.getLastPetFood({ petID });
			if (Option.isNone(lastPetFood)) return null;
			return yield* updateReminder(
				queue.removeFromQueue(lastPetFood.value.id),
				'O atraso de notificação foi excluído, mas não foi possível cancelar o lembrete. Ele ainda pode ser enviado.',
			);
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	const deletePetFoodAndNotification = Effect.fn(
		'PetFoodService.deletePetFoodAndNotification',
	)(
		function* (petFoodID: PetFoodID) {
			yield* petFoodRepository.deletePetFood(petFoodID);
			return yield* updateReminder(
				queue.removeFromQueue(petFoodID),
				'A ração foi excluída, mas não foi possível cancelar o lembrete. Ele ainda pode ser enviado.',
			);
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	const updatePetFoodAndNotification = Effect.fn(
		'PetFoodService.updatePetFoodAndNotification',
	)(
		function* (
			petID: PetID,
			petFoodID: PetFoodID,
			quantity: number,
			time: Date,
			timeChanged: boolean,
		) {
			const notificationDelay = yield* config
				.getConfig('pet', 'notificationDelay', petID)
				.pipe(Effect.option);
			const lastPetFood = yield* db.transaction((tx) =>
				Effect.gen(function* () {
					yield* petFoodRepository.updatePetFood(
						{ petFoodID, values: { quantity, time } },
						tx,
					);
					return yield* petFoodRepository.getLastPetFood({ petID }, tx);
				}),
			);
			if (
				timeChanged &&
				Option.isSome(lastPetFood) &&
				lastPetFood.value.id === petFoodID &&
				Option.isSome(notificationDelay)
			) {
				return yield* updateReminder(
					scheduleReminder(
						petID,
						petFoodID,
						DateTime.makeUnsafe(time),
						notificationDelay.value,
					),
					'A ração foi alterada, mas não foi possível atualizar o lembrete. O lembrete pode estar incorreto.',
				);
			}
			return null;
		},
		Effect.uninterruptible,
		updates.withPermit,
	);

	return {
		addPetFoodAndScheduleNotification,
		rescheduleLastPetFoodNotification,
		setNotificationDelayAndReschedule,
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

	static readonly layer = Layer.effect(this, makePetFoodService);
}
