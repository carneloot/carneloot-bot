import { addDays, isAfter, set, subDays } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

import { ConfigValue } from '../../lib/entities/config.js';

export function getDailyFromTo(now: Date, dayStart: ConfigValue<'pet', 'dayStart'>) {
	let from = zonedTimeToUtc(
		set(now, {
			hours: dayStart.hour,
			minutes: 0,
			seconds: 0,
			milliseconds: 0
		}),
		dayStart.timezone
	);

	if (isAfter(from, now)) {
		from = subDays(from, 1);
	}

	const to = addDays(from, 1);

	return { from, to };
}
