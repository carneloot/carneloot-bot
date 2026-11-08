import { DateTime, Duration } from 'effect';

const LIMIT_DURATION = Duration.fromInputUnsafe('1 minutes');

export const isDuplicatePetFoodEntry = (
	lastPetFoodTime: DateTime.DateTime,
	time: DateTime.DateTime,
) =>
	Duration.isLessThanOrEqualTo(
		DateTime.distance(time, lastPetFoodTime).pipe(Duration.abs),
		LIMIT_DURATION,
	);
