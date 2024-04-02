import { describe, expect, it } from 'bun:test';

import { zonedTimeToUtc } from 'date-fns-tz';

import { getDailyFromTo } from './get-daily-from-to.js';

describe('getDailyFromTo', () => {
	const timezone = 'America/Sao_Paulo';

	it('returns from and to dates when now is before dayStart', () => {
		const now = zonedTimeToUtc(new Date(2024, 2, 5, 3, 30, 12), timezone);
		const dayStart = { hour: 4, timezone };
		const result = getDailyFromTo(now, dayStart);
		expect(result.from).toEqual(zonedTimeToUtc(new Date(2024, 2, 4, 4, 0, 0), timezone));
		expect(result.to).toEqual(zonedTimeToUtc(new Date(2024, 2, 5, 4, 0, 0), timezone));
	});

	it('returns from and to dates when now is after dayStart', () => {
		const now = zonedTimeToUtc(new Date(2024, 2, 7, 18, 12, 57), timezone);
		const dayStart = { hour: 7, timezone };
		const result = getDailyFromTo(now, dayStart);
		expect(result.from).toEqual(zonedTimeToUtc(new Date(2024, 2, 7, 7, 0, 0), timezone));
		expect(result.to).toEqual(zonedTimeToUtc(new Date(2024, 2, 8, 7, 0, 0), timezone));
	});

	it.only('returns from and to dates when now hour is exactly at dayStart', () => {
		const now = zonedTimeToUtc(new Date(2024, 2, 7, 9, 12, 57), timezone);
		const dayStart = { hour: 9, timezone };
		const result = getDailyFromTo(now, dayStart);

		expect(result.from).toEqual(zonedTimeToUtc(new Date(2024, 2, 7, 9, 0, 0), timezone));
		expect(result.to).toEqual(zonedTimeToUtc(new Date(2024, 2, 8, 9, 0, 0), timezone));
	});
});
