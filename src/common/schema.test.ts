import { describe, expect, it } from 'bun:test';
import { Array as A, Duration, Either, Schema, pipe } from 'effect';

import { DurationFromParts } from './schema.js';

describe('DurationFromParts', () => {
	it('decoded value should equal the encoded one back', () => {
		const input = {
			years: 2,
			months: 10,
			weeks: 3,
			days: 6,
			hours: 7,
			minutes: 16,
			seconds: 14
		};

		const decoded = Schema.decodeEither(DurationFromParts)(input);

		expect(decoded._tag).toEqual('Right');

		const output = Either.getOrThrow(decoded);

		const encoded = Schema.encodeEither(DurationFromParts)(output);

		expect(encoded._tag).toEqual('Right');

		const finalResult = Either.getOrThrow(encoded);

		expect(finalResult).toEqual(input);
	});

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

	describe('Encoding', () => {
		it('should correctly encode a zero duration', () => {
			const output = Schema.encodeEither(DurationFromParts)(Duration.zero);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual({});
		});

		it('should correctly encode a simple duration', () => {
			const output = Schema.encodeEither(DurationFromParts)(
				Duration.decode('7 minute')
			);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual({
				minutes: 7
			});
		});

		it('should correctly encode a complex duration', () => {
			const input = pipe(
				[
					Duration.seconds(879),
					Duration.days(22),
					Duration.weeks(72),
					Duration.hours(427)
				],
				A.reduce(Duration.zero, Duration.sum)
			);

			const output = Schema.encodeEither(DurationFromParts)(input);

			expect(output._tag).toEqual('Right');

			const result = Either.getOrThrow(output);

			expect(result).toEqual({
				years: 1,
				months: 5,
				weeks: 4,
				hours: 19,
				minutes: 14,
				seconds: 39
			});
		});
	});
});
