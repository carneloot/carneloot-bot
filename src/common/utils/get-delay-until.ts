import { DateTime, Duration } from 'effect';

export const getDelayUntil = (
	now: DateTime.DateTime,
	timeToRun: DateTime.DateTime,
) =>
	DateTime.distance(now, timeToRun).pipe(Duration.toMillis, (delay) =>
		Math.max(delay, 0),
	);
