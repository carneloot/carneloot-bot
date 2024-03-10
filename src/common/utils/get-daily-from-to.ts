import { addDays, isAfter, set, subDays } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

import { ConfigValue } from '../../lib/entities/config.js';

export function getDailyFromTo(now: Date, dayStart: ConfigValue<'pet', 'dayStart'>) {
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
