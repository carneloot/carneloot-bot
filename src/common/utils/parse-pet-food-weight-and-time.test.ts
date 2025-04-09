import { beforeEach, describe, expect, it } from '@effect/vitest';

import { getUnixTime, set } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Effect, Either, Equal, Exit } from 'effect';

import Qty from 'js-quantities';

import {
	ParsePetFoodError,
	parsePetFoodWeightAndTime
} from './parse-pet-food-weight-and-time.js';

describe('parsePetFoodWeightAndTime', () => {
	const timezone = 'America/Sao_Paulo';
	let date: Date;

	beforeEach(() => {
		date = zonedTimeToUtc(new Date(2024, 2, 10, 17, 30, 30, 0), timezone);
	});

	it.effect('returns an error when messageMatch is not provided', () =>
		Effect.gen(function* () {
			const result = yield* Effect.exit(
				parsePetFoodWeightAndTime({
					messageTime: getUnixTime(date),
					timezone
				})
			);

			const expected = Exit.fail(
				new ParsePetFoodError({ message: 'Por favor, envie uma mensagem' })
			);

			expect(Equal.equals(result, expected)).toBeTruthy();
		})
	);

	it.effect('returns an error when messageMatch does not match the regex', () =>
		Effect.gen(function* () {
			const result = yield* Effect.exit(
				parsePetFoodWeightAndTime({
					messageMatch: 'invalid message',
					messageTime: getUnixTime(date),
					timezone
				})
			);

			const expected = Exit.fail(
				new ParsePetFoodError({
					message:
						'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
				})
			);

			expect(Equal.equals(result, expected)).toBeTruthy();
		})
	);

	it.effect(
		'returns the quantity and time when only the quantity is passed',
		() =>
			Effect.gen(function* () {
				const result = yield* parsePetFoodWeightAndTime({
					messageMatch: '10',
					messageTime: getUnixTime(date),
					timezone
				});

				expect(result).toEqual({
					quantity: expect.any(Qty),
					time: date,
					timeChanged: false
				});
				expect(result.quantity.scalar).toEqual(10);
			})
	);

	it.effect(
		'returns the quantity and time when the quantity is passed in other units',
		() =>
			Effect.gen(function* () {
				const resultKilo = yield* parsePetFoodWeightAndTime({
					messageMatch: '1kg',
					messageTime: getUnixTime(date),
					timezone
				});
				const resultMilli = yield* parsePetFoodWeightAndTime({
					messageMatch: '100mg',
					messageTime: getUnixTime(date),
					timezone
				});

				expect(resultKilo).toEqual({
					quantity: expect.any(Qty),
					time: date,
					timeChanged: false
				});
				expect(resultKilo.quantity.scalar).toEqual(1000);

				expect(resultMilli).toEqual({
					quantity: expect.any(Qty),
					time: date,
					timeChanged: false
				});
				expect(resultMilli.quantity.scalar).toEqual(0.1);
			})
	);

	it.effect(
		'returns the quantity and time when the messageMatch is valid',
		() =>
			Effect.gen(function* () {
				const result = yield* parsePetFoodWeightAndTime({
					messageMatch: '5.2g 12:00',
					messageTime: getUnixTime(date),
					timezone
				});

				const time = zonedTimeToUtc(
					set(utcToZonedTime(date, timezone), {
						hours: 12,
						minutes: 0,
						seconds: 0,
						milliseconds: 0
					}),
					timezone
				);

				expect(result).toEqual({
					quantity: expect.any(Qty),
					time,
					timeChanged: true
				});
				expect(result.quantity.scalar).toEqual(5.2);
			})
	);

	it.effect(
		'returns the quantity and time when the messageMatch is valid and includes a date',
		() =>
			Effect.gen(function* () {
				const result = yield* parsePetFoodWeightAndTime({
					messageMatch: '32g 01-03-2024 14:30',
					messageTime: getUnixTime(date),
					timezone
				});

				const time = zonedTimeToUtc(
					set(utcToZonedTime(date, timezone), {
						date: 1,
						month: 2,
						year: 2024,
						hours: 14,
						minutes: 30,
						seconds: 0,
						milliseconds: 0
					}),
					timezone
				);

				expect(result).toEqual({
					quantity: expect.any(Qty),
					time,
					timeChanged: true
				});
				expect(result.quantity.scalar).toEqual(32);
			})
	);

	it.effect(
		'should return the last day if the time is after the message time',
		() =>
			Effect.gen(function* () {
				const date = zonedTimeToUtc(new Date(2024, 6, 15, 1, 21, 0), timezone);
				const result = yield* parsePetFoodWeightAndTime({
					messageMatch: '10g 20:15',
					messageTime: getUnixTime(date),
					timezone
				});

				const expectedDate = zonedTimeToUtc(
					new Date(2024, 6, 14, 20, 15, 0),
					timezone
				);

				expect(result).toEqual({
					quantity: expect.any(Qty),
					time: expectedDate,
					timeChanged: true
				});
				expect(result.quantity.scalar).toEqual(10);
			})
	);
});
