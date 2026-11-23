import { DateTime, Duration } from 'effect';
import { describe, expect, it } from 'vitest';

import { getDelayUntil } from '../../../src/common/utils/get-delay-until.js';

describe('getDelayUntil', () => {
	const now = DateTime.makeUnsafe(new Date('2026-11-06T12:00:00.000Z'));

	it('returns the delay for a future scheduled time', () => {
		const timeToRun = DateTime.addDuration(now, '2 hours');

		expect(getDelayUntil(now, timeToRun)).toBe(Duration.toMillis('2 hours'));
	});

	it('returns zero for an overdue scheduled time', () => {
		const timeToRun = DateTime.subtract(now, { minutes: 1 });

		expect(getDelayUntil(now, timeToRun)).toBe(0);
	});
});
