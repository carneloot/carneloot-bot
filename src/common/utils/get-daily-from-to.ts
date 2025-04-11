import { DateTime } from 'effect';

import type { ConfigValue } from '../../lib/entities/config.js';

export const getDailyFromTo = (
	now: DateTime.DateTime,
	dayStart: Pick<ConfigValue<'pet', 'dayStart'>, 'hour'>
) => {
	const from = now.pipe(
		DateTime.setParts({
			hours: dayStart.hour,
			minutes: 0,
			seconds: 0,
			millis: 0
		}),
		(v) =>
			DateTime.greaterThan(v, now) ? DateTime.subtractDuration(v, '1 day') : v
	);

	const to = DateTime.addDuration(from, '1 day');

	return {
		from: DateTime.toUtc(from),
		to: DateTime.toUtc(to)
	};
};
