import { isAfter } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { type ResultAsync, ok } from 'neverthrow';

import type Qty from 'js-quantities';

import type { PetID, UserID } from '../database/schema.js';
import type { ConfigValue } from '../entities/config.js';
import {
	addPetFood,
	cancelPetFoodNotification,
	getLastPetFood,
	schedulePetFoodNotification
} from '../entities/pet-food.js';

type Params = {
	petID: PetID;
	messageID: number;
	userID: UserID;

	time: Date;
	timeChanged: boolean;
	quantity: Qty;

	dayStart: ConfigValue<'pet', 'dayStart'>;
};

type Result = {
	message: string;
};

const addPetFoodAndScheduleNotification = async ({
	petID,
	messageID,
	userID,

	timeChanged,
	time,
	quantity,

	dayStart
}: Params): Promise<ResultAsync<Result, string>> => {
	const lastPetFood = await getLastPetFood(petID);

	const petFood = await addPetFood({
		petID,
		messageID,
		userID,

		quantity: quantity.scalar,
		time
	});

	const message = [
		`Foram adicionados ${quantity} de ração.`,
		timeChanged &&
			`A ração foi adicionada para ${utcToZonedTime(time, dayStart.timezone).toLocaleString('pt-BR')}`
	]
		.filter(Boolean)
		.join(' ');

	if (!lastPetFood || isAfter(time, lastPetFood.time)) {
		if (lastPetFood) {
			await cancelPetFoodNotification(lastPetFood.id);
		}

		await schedulePetFoodNotification(petID, petFood.id, time);
	}

	return ok({ message });
};

export const petFoodService = {
	addPetFoodAndScheduleNotification
};
