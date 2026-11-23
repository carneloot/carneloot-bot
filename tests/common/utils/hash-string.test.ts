import { describe, expect, it } from 'vitest';

import { hashString } from '../../../src/common/utils/hash-string.js';

describe('hashString', () => {
	it('returns the stable SHA-256 digest used for API keys', () => {
		expect(hashString('pet-food-api-key')).toBe(
			'a30dda5cbe99748d31bf7f306ea821a89452e9fd97beb252c8fd32e51701f554',
		);
	});
});
