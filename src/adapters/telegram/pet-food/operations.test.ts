import { Duration, Option, Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import {
	AddedFoodDto,
	DayStartDto,
	FoodEntryDto,
	NotificationDelayDto,
} from './codecs.js';

describe('pet-food conversation codecs', () => {
	it('round-trips persisted day-start, delay, food, and operation outcome values', () => {
		const food = {
			id: 'food-1',
			quantity: 125,
			time: new Date('2025-01-02T03:04:05.000Z'),
			user: {
				id: 'user-1',
				telegramID: '42',
				username: null,
				firstName: 'Ana',
				lastName: 'Silva',
			},
		};

		for (const [schema, value] of [
			[DayStartDto, { hour: 8, timezone: 'America/Sao_Paulo' }],
			[NotificationDelayDto, Option.some(Duration.minutes(30))],
			[FoodEntryDto, food],
			[AddedFoodDto, { message: 'Foram adicionados 125 g de ração.' }],
		] as const) {
			const encoded = Result.getOrThrow(Schema.encodeResult(schema)(value));
			expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
			expect(Result.getOrThrow(Schema.decodeResult(schema)(encoded))).toEqual(
				value,
			);
		}
	});

	it('rejects malformed persisted food entries', () => {
		expect(
			Schema.decodeUnknownResult(FoodEntryDto)({
				id: 'food-1',
				quantity: '125',
				time: 'not-a-date',
				user: {},
			})._tag,
		).toBe('Failure');
	});
});
