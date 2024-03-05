import { addDays, isAfter, set, subDays } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

import { ConfigValue } from '../../lib/entities/config.js';

export function getDailyFromTo(now: Date, dayStart: ConfigValue<'pet', 'dayStart'>) {
	let from = set(now, {
		hours: dayStart.hour,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});

	if (isAfter(from, now)) {
		from = subDays(from, 1);
	}

	from = zonedTimeToUtc(from, dayStart.timezone);

	const to = zonedTimeToUtc(addDays(from, 1), dayStart.timezone);

	return { from, to };
}
