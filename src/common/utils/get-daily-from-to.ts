import { DateTime } from 'effect';

import type { ConfigValue } from '../../lib/entities/config.js';

export const getDailyFromTo = (
	now: DateTime.DateTime,
	dayStart: ConfigValue<'pet', 'dayStart'>
) => {
	const nowZoned = now.pipe(DateTime.unsafeSetZoneNamed(dayStart.timezone));

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
