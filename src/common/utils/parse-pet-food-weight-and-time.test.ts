import { beforeEach, describe, expect, it } from 'bun:test';
import { getUnixTime, set } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Either } from 'effect';

import Qty from 'js-quantities';

import { parsePetFoodWeightAndTime } from './parse-pet-food-weight-and-time.js';

describe('parsePetFoodWeightAndTime', () => {
	const timezone = 'America/Sao_Paulo';
	let date: Date;

	beforeEach(() => {
		date = zonedTimeToUtc(new Date(2024, 2, 10, 17, 30, 30, 0), timezone);
	});

	it('returns an error when messageMatch is not provided', () => {
		const result = parsePetFoodWeightAndTime({
			messageTime: getUnixTime(date),
			timezone
		});
		expect(result).toEqual(Either.left('Por favor, envie uma mensagem'));
	});

	it('returns an error when messageMatch does not match the regex', () => {
		const result = parsePetFoodWeightAndTime({
			messageMatch: 'invalid message',
			messageTime: getUnixTime(date),
			timezone
		});

		expect(result).toEqual(
			Either.left(
				'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
			)
		);
	});

	it('returns the quantity and time when only the quantity is passed', () => {
		const result = parsePetFoodWeightAndTime({
			messageMatch: '10g',
			messageTime: getUnixTime(date),
			timezone
		});

		expect(result).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time: date,
				timeChanged: false
			})
		);
		if (Either.isRight(result)) {
			expect(result.right.quantity.scalar).toEqual(10);
		}
	});

	it('returns the quantity and time when the quantity is passed in other units', () => {
		const resultKilo = parsePetFoodWeightAndTime({
			messageMatch: '1kg',
			messageTime: getUnixTime(date),
			timezone
		});
		const resultMilli = parsePetFoodWeightAndTime({
			messageMatch: '100mg',
			messageTime: getUnixTime(date),
			timezone
		});

		expect(resultKilo).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time: date,
				timeChanged: false
			})
		);
		if (Either.isRight(resultKilo)) {
			expect(resultKilo.right.quantity.scalar).toEqual(1000);
		}

		expect(resultMilli).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time: date,
				timeChanged: false
			})
		);
		if (Either.isRight(resultMilli)) {
			expect(resultMilli.right.quantity.scalar).toEqual(0.1);
		}
	});

	it('returns the quantity and time when the messageMatch is valid', () => {
		const result = parsePetFoodWeightAndTime({
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

		expect(result).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time,
				timeChanged: true
			})
		);
		if (Either.isRight(result)) {
			expect(result.right.quantity.scalar).toEqual(5.2);
		}
	});

	it('returns the quantity and time when the messageMatch is valid and includes a date', () => {
		const result = parsePetFoodWeightAndTime({
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

		expect(result).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time,
				timeChanged: true
			})
		);
		if (Either.isRight(result)) {
			expect(result.right.quantity.scalar).toEqual(32);
		}
	});

	it('should return the last day if the time is after the message time', () => {
		const date = zonedTimeToUtc(new Date(2024, 6, 15, 0, 5, 0), timezone);
		const result = parsePetFoodWeightAndTime({
			messageMatch: '10 23:55',
			messageTime: getUnixTime(date),
			timezone
		});

		const expectedDate = zonedTimeToUtc(
			new Date(2024, 6, 14, 23, 55, 0),
			timezone
		);

		expect(result).toEqual(
			Either.right({
				quantity: expect.any(Qty),
				time: expectedDate,
				timeChanged: true
			})
		);
		if (Either.isRight(result)) {
			expect(result.right.quantity.scalar).toEqual(10);
		}
	});
});
