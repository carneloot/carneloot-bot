import { addDays, isAfter, set, subDays } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { DateTime, Option } from 'effect';

import type { ConfigValue } from '../../lib/entities/config.js';

export function getDailyFromTo(
	now: Date,
	dayStart: ConfigValue<'pet', 'dayStart'>
) {
	const nowZoned = utcToZonedTime(now, dayStart.timezone);

	let fromZoned = set(nowZoned, {
		hours: dayStart.hour,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});

	if (isAfter(fromZoned, nowZoned)) {
		fromZoned = subDays(fromZoned, 1);
	}

	const toZoned = addDays(fromZoned, 1);

	return {
		from: zonedTimeToUtc(fromZoned, dayStart.timezone),
		to: zonedTimeToUtc(toZoned, dayStart.timezone)
	};
}

export const getDailyFromToEffect = (
	now: DateTime.Utc,
	dayStart: ConfigValue<'pet', 'dayStart'>
) => {
	const timezone = DateTime.zoneFromString(dayStart.timezone).pipe(
		Option.getOrThrow
	);

	const nowZoned = now.pipe(DateTime.setZone(timezone));

	const fromZoned = nowZoned.pipe(
		DateTime.setParts({
			hours: dayStart.hour,
			minutes: 0,
			seconds: 0,
			millis: 0
		}),
		(v) =>
			DateTime.greaterThan(v, nowZoned)
				? DateTime.subtractDuration(v, '1 day')
				: v
	);

	const toZoned = DateTime.addDuration(fromZoned, '1 day');

	return {
		from: DateTime.toUtc(fromZoned),
		to: DateTime.toUtc(toZoned)
	};
};
