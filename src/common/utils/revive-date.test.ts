import { describe, expect, it } from 'vitest';

import { reviveDate } from './revive-date.js';

describe('reviveDate', () => {
	it('revives a date serialized through JSON', () => {
		const date = new Date('2026-07-13T00:37:15.000Z');
		const serialized = JSON.parse(JSON.stringify({ date })) as { date: string };

		expect(reviveDate(serialized.date)).toEqual(date);
	});
});
