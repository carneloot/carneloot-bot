import { DateTime } from 'effect';

export const getDailyFromTo = (
	now: DateTime.DateTime,
	dayStart: { hour: number; timezone: string },
) => {
	const nowZoned = now.pipe(DateTime.setZoneNamedUnsafe(dayStart.timezone));

	const fromZoned = nowZoned.pipe(
		DateTime.setParts({
			hour: dayStart.hour,
			minute: 0,
			second: 0,
			millisecond: 0,
		}),
		(v) =>
			DateTime.isGreaterThan(v, nowZoned)
				? DateTime.subtractDuration(v, '1 day')
				: v,
	);

	const toZoned = DateTime.addDuration(fromZoned, '1 day');

	return {
		from: DateTime.toUtc(fromZoned),
		to: DateTime.toUtc(toZoned),
	};
};
