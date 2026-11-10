import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	activeWrites: 0,
	addedFoods: [] as Array<Record<string, unknown>>,
	dayStart: { hour: 4, timezone: 'America/Sao_Paulo' },
	getUserCaredPets: vi.fn(),
	getUserOwnedPets: vi.fn(),
	maxConcurrentWrites: 0,
	notifications: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../src/lib/entities/config.js', () => ({
	ConfigService: Effect.succeed({
		getConfig: () => Effect.succeed(mocks.dayStart),
	}),
}));

vi.mock('../../../src/lib/entities/pet.js', () => ({
	getUserCaredPets: mocks.getUserCaredPets,
	getUserOwnedPets: mocks.getUserOwnedPets,
}));

vi.mock('../../../src/lib/services/pet-food.js', () => ({
	PetFoodService: Effect.succeed({
		addPetFoodAndScheduleNotification: (input: Record<string, unknown>) =>
			Effect.tryPromise(
				() =>
					new Promise<void>((resolve) => {
						mocks.activeWrites += 1;
						mocks.maxConcurrentWrites = Math.max(
							mocks.maxConcurrentWrites,
							mocks.activeWrites,
						);
						setTimeout(() => {
							mocks.activeWrites -= 1;
							mocks.addedFoods.push(input);
							resolve();
						}, 5);
					}),
			),
	}),
}));

vi.mock(
	'../../../src/modules/pet-food/utils/send-added-food-notification.js',
	() => ({
		sendAddedFoodNotification: (input: Record<string, unknown>) => () =>
			Effect.sync(() => mocks.notifications.push(input)),
	}),
);

vi.mock('../../../src/runtime.js', () => ({
	runtime: { runPromise: Effect.runPromise },
}));

import { AddFoodAllCommand } from '../../../src/modules/pet-food/add-food-all.command.js';

describe('AddFoodAllCommand', () => {
	beforeEach(() => {
		mocks.activeWrites = 0;
		mocks.addedFoods.length = 0;
		mocks.maxConcurrentWrites = 0;
		mocks.notifications.length = 0;
		mocks.getUserOwnedPets.mockReset();
		mocks.getUserCaredPets.mockReset();
	});

	afterEach(() => vi.restoreAllMocks());

	it('adds the parsed food amount to owned and cared pets, then confirms success', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([
			{ id: 'owned-pet', name: 'Luna' },
		]);
		mocks.getUserCaredPets.mockResolvedValue([
			{ id: 'cared-pet', name: 'Theo' },
		]);
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

		await AddFoodAllCommand(ctx as never);

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

	it('reports the empty-pet state without parsing or writing food', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([]);
		mocks.getUserCaredPets.mockResolvedValue([]);
		const ctx = {
			message: { date: 1_700_000_000, message_id: 42, text: '/todos 25g' },
			react: vi.fn().mockResolvedValue(undefined),
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'user-1' },
		};

		await AddFoodAllCommand(ctx as never);

		expect(mocks.addedFoods).toHaveLength(0);
		expect(mocks.notifications).toHaveLength(0);
		expect(ctx.reply).toHaveBeenCalledWith('Você não possui nenhum pet');
		expect(ctx.react).not.toHaveBeenCalled();
	});
});
