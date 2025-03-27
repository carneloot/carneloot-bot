import { describe, expect, it } from 'bun:test';
import { Duration, Either, Schema } from 'effect';

import { DurationFromParts } from './schema.js';

describe('DurationFromParts', () => {
	describe('Decoding', () => {
		it('should correctly decode an empty object', () => {
			const output = Schema.decodeEither(DurationFromParts)({});

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual(Duration.zero);
		});

		it('should correctly decode from simple object', () => {
			const input = {
				minutes: 15
			};

			const output = Schema.decodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual(Duration.decode('15 minutes'));
		});

		it('should correctly decode years', () => {
			const input = {
				years: 2
			};

			const output = Schema.decodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual(Duration.decode('730 days'));
		});

		it('should correctly decode months', () => {
			const input = {
				months: 16
			};

			const output = Schema.decodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual(Duration.decode('480 days'));
		});

		it('should correctly decode weeks', () => {
			const input = {
				weeks: 16
			};

			const output = Schema.decodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual(Duration.decode('112 days'));
		});

		it('should correctly decode a full object', () => {
			const input = {
				years: 3,
				months: 7,
				weeks: 12,
				days: 56,
				hours: 12,
				minutes: 23,
				seconds: 58
			};

			const output = Schema.decodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);
			const expected = Duration.decode('124892638 seconds');

			expect(result).toEqual(expected);
		});
	});
});
