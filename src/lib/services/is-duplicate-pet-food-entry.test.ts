import { describe, expect, it } from '@effect/vitest';
import { DateTime } from 'effect';

import { isDuplicatePetFoodEntry } from './is-duplicate-pet-food-entry.js';

describe('isDuplicatePetFoodEntry', () => {
	it('allows a food time earlier than the latest entry', () => {
		const latestFoodTime = DateTime.makeUnsafe('2026-11-08T18:13:00.000Z');
		const foodTime = DateTime.makeUnsafe('2026-11-08T10:12:00.000Z');

		expect(isDuplicatePetFoodEntry(latestFoodTime, foodTime)).toBe(false);
	});

	it('rejects a food time within one minute of the latest entry', () => {
		const latestFoodTime = DateTime.makeUnsafe('2026-11-08T10:13:00.000Z');
		const foodTime = DateTime.makeUnsafe('2026-11-08T10:12:30.000Z');

		expect(isDuplicatePetFoodEntry(latestFoodTime, foodTime)).toBe(true);
	});
});
