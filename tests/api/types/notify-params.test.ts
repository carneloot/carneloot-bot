import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { NotifyParamsSchema } from '../../../src/api/types/notify-params.js';

describe('NotifyParamsSchema', () => {
	it('accepts string and numeric template variables', () => {
		const result = Schema.decodeUnknownResult(NotifyParamsSchema)({
			apiKey: 'key',
			keyword: 'food_due',
			variables: { pet: 'Luna', minutes: 15 },
		});

		expect(Result.getOrThrow(result)).toEqual({
			apiKey: 'key',
			keyword: 'food_due',
			variables: { pet: 'Luna', minutes: 15 },
		});
	});

	it('rejects non-string and non-numeric template variables', () => {
		const result = Schema.decodeUnknownResult(NotifyParamsSchema)({
			apiKey: 'key',
			keyword: 'food_due',
			variables: { late: true },
		});

		expect(result._tag).toBe('Failure');
	});
});
