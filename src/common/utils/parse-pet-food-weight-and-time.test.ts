import { beforeEach, describe, expect, it } from 'bun:test';
import { getUnixTime, set } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { err } from 'neverthrow';

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
		expect(result).toEqual(err('Por favor, envie uma mensagem'));
	});

	it('returns an error when messageMatch does not match the regex', () => {
		const result = parsePetFoodWeightAndTime({
			messageMatch: 'invalid message',
			messageTime: getUnixTime(date),
			timezone
		});

		expect(result).toEqual(
			err(
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

		expect(result.isOk()).toBeTrue();
		if (result.isOk()) {
			expect(result.value.quantity.scalar).toEqual(10);
			expect(result.value.time).toEqual(date);
			expect(result.value.timeChanged).toBeFalse();
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

		expect(resultKilo.isOk()).toBeTrue();
		if (resultKilo.isOk()) {
			expect(resultKilo.value.quantity.scalar).toEqual(1000);
			expect(resultKilo.value.time).toEqual(date);
			expect(resultKilo.value.timeChanged).toBeFalse();
		}

		expect(resultMilli.isOk()).toBeTrue();
		if (resultMilli.isOk()) {
			expect(resultMilli.value.quantity.scalar).toEqual(0.1);
			expect(resultMilli.value.time).toEqual(date);
			expect(resultMilli.value.timeChanged).toBeFalse();
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

		expect(result.isOk()).toBeTrue();
		if (result.isOk()) {
			expect(result.value.quantity.scalar).toEqual(5.2);
			expect(result.value.time).toEqual(time);
			expect(result.value.timeChanged).toBeTrue();
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

		expect(result.isOk()).toBeTrue();
		if (result.isOk()) {
			expect(result.value.quantity.scalar).toEqual(32);
			expect(result.value.time).toEqual(time);
			expect(result.value.timeChanged).toBeTrue();
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

		expect(result.isOk()).toBeTrue();
		if (result.isOk()) {
			expect(result.value.quantity.scalar).toEqual(10);
			expect(result.value.time).toEqual(expectedDate);
			expect(result.value.timeChanged).toBeTrue();
		}
	});
});
