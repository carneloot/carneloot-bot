import { describe, expect, it } from 'vitest';

import { DateTime } from 'effect';

import { getDailyFromTo } from './get-daily-from-to.js';

describe('getDailyFromTo', () => {
	const timezone = 'America/Sao_Paulo';

	const makeDateTime = (input: DateTime.DateTime.Input) =>
		DateTime.toUtc(
			DateTime.unsafeMakeZoned(input, {
				timeZone: timezone
			})
		);

	it('returns from and to dates when now is before dayStart', () => {
		const now = makeDateTime(new Date(2024, 2, 5, 3, 30, 12));

		const dayStart = { hour: 4, timezone };
		const result = getDailyFromTo(now, dayStart);

		expect(result.from).toEqual(makeDateTime(new Date(2024, 2, 4, 4, 0, 0)));
		expect(result.to).toEqual(makeDateTime(new Date(2024, 2, 5, 4, 0, 0)));
	});

	it('returns from and to dates when now is after dayStart', () => {
		const now = makeDateTime(new Date(2024, 2, 7, 18, 12, 57));

		const dayStart = { hour: 7, timezone };
		const result = getDailyFromTo(now, dayStart);

		expect(result.from).toEqual(makeDateTime(new Date(2024, 2, 7, 7, 0, 0)));
		expect(result.to).toEqual(makeDateTime(new Date(2024, 2, 8, 7, 0, 0)));
	});

	it('returns from and to dates when now hour is exactly at dayStart', () => {
		const now = makeDateTime(new Date(2024, 2, 7, 9, 12, 57));
		const dayStart = { hour: 9, timezone };
		const result = getDailyFromTo(now, dayStart);

		expect(result.from).toEqual(makeDateTime(new Date(2024, 2, 7, 9, 0, 0)));
		expect(result.to).toEqual(makeDateTime(new Date(2024, 2, 8, 9, 0, 0)));
	});
});
