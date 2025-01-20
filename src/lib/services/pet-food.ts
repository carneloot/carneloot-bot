import { isAfter } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { DateTime, Duration, Either, Option, pipe } from 'effect';

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

const LIMIT_DURATION = Duration.decode('1 minutes');

const addPetFoodAndScheduleNotification = async ({
	petID,
	messageID,
	userID,

	timeChanged,
	time,
	quantity,

	dayStart
}: Params): Promise<Either.Either<Result, string>> => {
	const lastPetFood = await getLastPetFood(petID);

	const shouldIgnoreEntry = pipe(
		lastPetFood,
		Option.fromNullable,
		Option.map((food) => food.time),
		Option.map(DateTime.unsafeFromDate),
		Option.map(DateTime.distanceDuration(DateTime.unsafeFromDate(time))),
		Option.map(Duration.lessThanOrEqualTo(LIMIT_DURATION)),
		Option.getOrElse(() => false)
	);

	if (shouldIgnoreEntry) {
		return Either.left(
			`Já foi colocado ração há menos de ${Duration.format(LIMIT_DURATION)}. Ignorando entrada.`
		);
	}

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

	return Either.right({ message });
};

export const petFoodService = {
	addPetFoodAndScheduleNotification
};
