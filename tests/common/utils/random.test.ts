import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomItem } from '../../../src/common/utils/random-item.js';
import { random } from '../../../src/common/utils/random.js';

describe('random helpers', () => {
	afterEach(() => vi.restoreAllMocks());

	it('maps a random value into the requested numeric range', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.25);

		expect(random(10, 30)).toBe(15);
	});

	it('can select the last item in a list', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.999);

		expect(randomItem(['first', 'middle', 'last'])).toBe('last');
	});
});
