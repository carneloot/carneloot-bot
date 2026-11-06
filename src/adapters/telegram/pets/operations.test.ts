import { Result, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import { PendingPetInviteDto, PetCarerDto, UserDto } from './operations.js';

describe('pet conversation DTOs', () => {
	it('round-trips pet-carer results through JSON-safe codecs', () => {
		const value = {
			id: 'invite-1',
			status: 'pending' as const,
			carer: {
				id: 'user-1',
				telegramID: '42',
				username: null,
				firstName: 'Ana',
				lastName: 'Silva',
			},
		};

		const encoded = Result.getOrThrow(Schema.encodeResult(PetCarerDto)(value));
		expect(JSON.parse(JSON.stringify(encoded))).toEqual(value);
		expect(
			Result.getOrThrow(Schema.decodeResult(PetCarerDto)(encoded)),
		).toEqual(value);
	});

	it('rejects non-JSON-safe persisted invite shapes', () => {
		const invalid = {
			id: 'invite-1',
			petName: 'Luna',
			petOwner: { id: 'owner-1', telegramID: 42 },
		};

		expect(
			Schema.decodeResult(PendingPetInviteDto)(invalid as never)._tag,
		).toBe('Failure');
		expect(Schema.decodeResult(UserDto)(invalid.petOwner as never)._tag).toBe(
			'Failure',
		);
	});
});
