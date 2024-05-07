import { describe, expect, it } from 'bun:test';

import { getRelativeTime } from './get-relative-time.js';

describe('getRelativeTime', () => {
	it('returns relative time in hours and minutes when dates are provided', () => {
		const baseDate = new Date(2022, 0, 1, 12, 0, 0);
		const date = new Date(2022, 0, 1, 14, 30, 0);
		const result = getRelativeTime(date, baseDate, {
			units: ['hours', 'minutes']
		});
		expect(result).toEqual('2 horas e 30 minutos');
	});

	it('returns relative time in days, hours and minutes when dates are provided', () => {
		const baseDate = new Date(2022, 0, 1, 12, 0, 0);
		const date = new Date(2022, 0, 3, 14, 30, 0);
		const result = getRelativeTime(date, baseDate, {
			units: ['days', 'hours', 'minutes']
		});
		expect(result).toEqual('2 dias, 2 horas e 30 minutos');
	});

	it('returns relative time in minutes when dates are provided and only minutes unit is specified', () => {
		const baseDate = new Date(2022, 0, 1, 12, 0, 0);
		const date = new Date(2022, 0, 1, 12, 30, 0);
		const result = getRelativeTime(date, baseDate, { units: ['minutes'] });
		expect(result).toEqual('30 minutos');
	});

	it('returns an empty string when dates are the same', () => {
		const baseDate = new Date(2022, 0, 1, 12, 0, 0);
		const date = new Date(2022, 0, 1, 12, 0, 0);
		const result = getRelativeTime(date, baseDate, {
			units: ['hours', 'minutes']
		});
		expect(result).toEqual('');
	});

	it('returns an empty string when no units are specified', () => {
		const baseDate = new Date(2022, 0, 1, 12, 0, 0);
		const date = new Date(2022, 0, 1, 14, 30, 0);
		const result = getRelativeTime(date, baseDate);
		expect(result).toEqual('');
	});
});
