import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppServices } from '../../../app/layer.js';
import type { Execute } from '../../execute.js';

const mocks = vi.hoisted(() => ({
	activeWrites: 0,
	addedFoods: [] as Array<Record<string, unknown>>,
	getUserCaredPets: vi.fn(),
	getUserOwnedPets: vi.fn(),
	maxConcurrentWrites: 0,
	notifications: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../lib/entities/config.js', () => ({
	ConfigService: Effect.succeed({
		getConfig: () => Effect.succeed({ hour: 4, timezone: 'America/Sao_Paulo' }),
	}),
}));

vi.mock('../../../lib/repositories/pet.js', () => ({
	PetRepository: Effect.succeed({
		getUserCaredPets: mocks.getUserCaredPets,
		getUserOwnedPets: mocks.getUserOwnedPets,
	}),
}));

vi.mock('../../../lib/services/pet-food.js', () => ({
	PetFoodService: Effect.succeed({
		addPetFoodAndScheduleNotification: (input: Record<string, unknown>) =>
			Effect.gen(function* () {
				mocks.activeWrites += 1;
				mocks.maxConcurrentWrites = Math.max(
					mocks.maxConcurrentWrites,
					mocks.activeWrites,
				);
				yield* Effect.yieldNow;
				mocks.activeWrites -= 1;
				mocks.addedFoods.push(input);
			}),
	}),
}));

vi.mock(
	'../../../modules/pet-food/utils/send-added-food-notification.js',
	() => ({
		sendAddedFoodNotification: (input: Record<string, unknown>) => () =>
			Effect.sync(() => mocks.notifications.push(input)),
	}),
);

import { createAddFoodAllCommand } from './add-food-all.js';

// Vitest replaces every service tag used by this command with the fakes above.
const execute = Effect.runPromise as Execute<AppServices>;

describe('createAddFoodAllCommand', () => {
	beforeEach(() => {
		mocks.activeWrites = 0;
		mocks.addedFoods.length = 0;
		mocks.maxConcurrentWrites = 0;
		mocks.notifications.length = 0;
		mocks.getUserOwnedPets.mockReset();
		mocks.getUserCaredPets.mockReset();
	});

	it('adds food to owned and cared pets one at a time, then confirms success', async () => {
		mocks.getUserOwnedPets.mockReturnValue(
			Effect.succeed([{ id: 'owned-pet', name: 'Luna' }]),
		);
		mocks.getUserCaredPets.mockReturnValue(
			Effect.succeed([{ id: 'cared-pet', name: 'Theo' }]),
		);
		const ctx = {
			message: { date: 1_700_000_000, message_id: 42, text: '/todos 25g' },
			react: vi.fn().mockResolvedValue(undefined),
			reply: vi.fn().mockResolvedValue(undefined),
			user: {
				id: 'user-1',
				firstName: 'Matheus',
				lastName: null,
				username: null,
			},
		};

		await createAddFoodAllCommand(execute)(ctx as never);

		expect(mocks.addedFoods).toHaveLength(2);
		expect(mocks.addedFoods.map((input) => input.pet)).toEqual([
			{ id: 'owned-pet', name: 'Luna' },
			{ id: 'cared-pet', name: 'Theo' },
		]);
		expect(mocks.addedFoods.map((input) => input.quantity)).toMatchObject([
			{ scalar: 25 },
			{ scalar: 25 },
		]);
		expect(mocks.maxConcurrentWrites).toBe(1);
		expect(mocks.notifications).toHaveLength(2);
		expect(ctx.reply).toHaveBeenCalledWith(
			'Foram adicionados 25 g de ração para todos os seus pets',
		);
		expect(ctx.react).toHaveBeenCalledOnce();
	});

	it('reports the empty-pet state without writing food', async () => {
		mocks.getUserOwnedPets.mockReturnValue(Effect.succeed([]));
		mocks.getUserCaredPets.mockReturnValue(Effect.succeed([]));
		const ctx = {
			message: { date: 1_700_000_000, message_id: 42, text: '/todos 25g' },
			react: vi.fn().mockResolvedValue(undefined),
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'user-1' },
		};

		await createAddFoodAllCommand(execute)(ctx as never);

		expect(mocks.addedFoods).toHaveLength(0);
		expect(mocks.notifications).toHaveLength(0);
		expect(ctx.reply).toHaveBeenCalledWith('Você não possui nenhum pet');
		expect(ctx.react).not.toHaveBeenCalled();
	});
});
