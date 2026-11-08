import { DateTime, Effect, Option, Schema } from 'effect';
import type { Duration } from 'effect';
import type Qty from 'js-quantities';

import type { PetFoodID, PetID, UserID } from '../../../lib/database/schema.js';
import type { ConfigValue } from '../../../lib/entities/config.js';
import { ConfigService } from '../../../lib/entities/config.js';
import { PetFoodRepository } from '../../../lib/repositories/pet-food.js';
import { PetRepository } from '../../../lib/repositories/pet.js';
import { PetFoodService } from '../../../lib/services/pet-food.js';
import { PetDto } from './codecs.js';

export {
	AddedFoodDto,
	DayStartDto,
	EmptyOutcome,
	FoodEntryDto,
	NotificationDelayDto,
	PetDto,
	UserDto,
} from './codecs.js';

export const getUserOwnedPets = (userID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) => pets.getUserOwnedPets(userID as UserID)),
	);

export const getUserPets = (userID: string) =>
	PetRepository.pipe(
		Effect.andThen((pets) =>
			Effect.all(
				[
					pets.getUserOwnedPets(userID as UserID),
					pets.getUserCaredPets(userID as UserID),
				],
				{
					concurrency: 'unbounded',
				},
			),
		),
		Effect.map(([owned, cared]) => [
			...owned,
			...cared.map((pet) => ({ id: pet.id, name: `${pet.name} (cuidando)` })),
		]),
	);

export const getDayStart = (petID: string) =>
	ConfigService.pipe(
		Effect.andThen((config) =>
			config.getConfig('pet', 'dayStart', petID as PetID),
		),
		Effect.option,
		Effect.map(Option.getOrNull),
	);

export const setDayStart = (
	petID: string,
	dayStart: ConfigValue<'pet', 'dayStart'>,
) =>
	ConfigService.pipe(
		Effect.andThen((config) =>
			config.setConfig('pet', 'dayStart', petID as PetID, dayStart),
		),
		Effect.as(null),
	);

export const getNotificationDelay = (petID: string) =>
	ConfigService.pipe(
		Effect.andThen((config) =>
			config.getConfig('pet', 'notificationDelay', petID as PetID),
		),
		Effect.option,
	);

export const setNotificationDelay = (petID: string, delay: Duration.Duration) =>
	PetFoodService.pipe(
		Effect.andThen((service) =>
			service.setNotificationDelayAndReschedule(petID as PetID, delay),
		),
		Effect.as(null),
	);

export const deleteNotificationDelay = (petID: string) =>
	PetFoodService.pipe(
		Effect.andThen((service) => service.disableNotification(petID as PetID)),
		Effect.as(null),
	);

export const getFoodEntries = (
	petID: string,
	from: DateTime.DateTime,
	to: DateTime.DateTime,
) =>
	PetFoodRepository.pipe(
		Effect.andThen((foods) =>
			foods.getPetFoodByRange({ petID: petID as PetID, from, to }),
		),
	);

export const deleteFood = (petFoodID: string) =>
	PetFoodService.pipe(
		Effect.andThen((service) =>
			service.deletePetFoodAndNotification(petFoodID as PetFoodID),
		),
		Effect.as(null),
	);

export const updateFood = (
	petID: string,
	petFoodID: string,
	quantity: number,
	time: Date,
	timeChanged: boolean,
) =>
	PetFoodService.pipe(
		Effect.andThen((service) =>
			service.updatePetFoodAndNotification(
				petID as PetID,
				petFoodID as PetFoodID,
				quantity,
				time,
				timeChanged,
			),
		),
		Effect.as(null),
	);

export const addFood = (
	pet: Schema.Schema.Type<typeof PetDto>,
	messageID: number,
	userID: string,
	time: Date,
	quantity: Qty,
	timeChanged: boolean,
	dayStart: ConfigValue<'pet', 'dayStart'>,
) =>
	PetFoodService.pipe(
		Effect.andThen((service) =>
			service.addPetFoodAndScheduleNotification({
				pet: { id: pet.id as PetID, name: pet.name },
				messageID,
				userID: userID as UserID,
				time: DateTime.makeUnsafe(time),
				quantity,
				timeChanged,
				dayStart,
			}),
		),
	);
