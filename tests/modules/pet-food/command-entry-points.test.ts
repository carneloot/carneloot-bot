import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUserCaredPets: vi.fn(),
	getUserOwnedPets: vi.fn(),
}));

vi.mock('../../../src/runtime.js', () => ({
	runtime: { runPromise: Effect.runPromise },
}));

vi.mock('../../../src/lib/entities/config.js', () => ({
	ConfigService: Effect.succeed({}),
	getConfig: vi.fn(),
	setConfig: vi.fn(),
}));

vi.mock('../../../src/lib/entities/pet.js', () => ({
	getUserCaredPets: mocks.getUserCaredPets,
	getUserOwnedPets: mocks.getUserOwnedPets,
}));

vi.mock('../../../src/lib/entities/pet-food.js', () => ({
	deletePetFood: vi.fn(),
	getPetFoodByRange: vi.fn(),
}));

vi.mock('../../../src/lib/queues/pet-food-notification.js', () => ({
	PetFoodNotificationQueue: undefined,
}));

vi.mock('../../../src/lib/repositories/pet-food.js', () => ({
	PetFoodRepository: undefined,
}));

vi.mock('../../../src/lib/services/pet-food.js', () => ({
	PetFoodService: undefined,
}));

import {
	AddFoodCommand,
	addFoodConversation,
} from '../../../src/modules/pet-food/add-food.command.js';
import {
	CorrectFoodCommand,
	correctFoodConversation,
} from '../../../src/modules/pet-food/correct-food.command.js';
import {
	DeleteFoodCommand,
	deleteFoodConversation,
} from '../../../src/modules/pet-food/delete-food.command.js';
import { FoodStatusCommand } from '../../../src/modules/pet-food/food-status.command.js';
import {
	SetDayStartCommand,
	setDayStartConversation,
} from '../../../src/modules/pet-food/set-day-start.command.js';
import { SetNotificationDelayCommand } from '../../../src/modules/pet-food/set-notification-delay.command.js';

const registrationMessage =
	'Por favor cadastre-se primeiro utilizando /cadastrar';

const createContext = (user?: { id: string }) => ({
	conversation: { enter: vi.fn().mockResolvedValue(undefined) },
	reply: vi.fn().mockResolvedValue(undefined),
	user,
});

const createConversation = (ctx: unknown) => ({
	external: async <T>(callback: (ctx: unknown) => T | Promise<T>) =>
		callback(ctx),
});

describe('pet food command entry points', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getUserOwnedPets.mockResolvedValue([]);
		mocks.getUserCaredPets.mockResolvedValue([]);
	});

	it('enters the add food conversation', async () => {
		const ctx = createContext();

		await AddFoodCommand(ctx as never);

		expect(ctx.conversation.enter).toHaveBeenCalledWith('addFood');
	});

	it('enters the delete food conversation with overwrite enabled', async () => {
		const ctx = createContext();

		await DeleteFoodCommand(ctx as never);

		expect(ctx.conversation.enter).toHaveBeenCalledWith('deleteFood', {
			overwrite: true,
		});
	});

	it.each([
		['CorrectFoodCommand', CorrectFoodCommand, 'correctFood'],
		['SetDayStartCommand', SetDayStartCommand, 'setDayStart'],
		[
			'SetNotificationDelayCommand',
			SetNotificationDelayCommand,
			'setNotificationDelay',
		],
	])('%s guards unregistered users', async (_, command) => {
		const ctx = createContext();

		await command(ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith(registrationMessage);
		expect(ctx.conversation.enter).not.toHaveBeenCalled();
	});

	it.each([
		['CorrectFoodCommand', CorrectFoodCommand, 'correctFood'],
		['SetDayStartCommand', SetDayStartCommand, 'setDayStart'],
		[
			'SetNotificationDelayCommand',
			SetNotificationDelayCommand,
			'setNotificationDelay',
		],
	])(
		'%s enters its conversation for registered users',
		async (_, command, name) => {
			const ctx = createContext({ id: 'user-1' });

			await command(ctx as never);

			expect(ctx.conversation.enter).toHaveBeenCalledWith(name, {
				overwrite: true,
			});
		},
	);

	it('replies with the registration message when FoodStatus is called directly by an unregistered user', async () => {
		const ctx = createContext();

		await FoodStatusCommand(ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith(registrationMessage);
	});
});

describe('pet food conversation guards', () => {
	it.each([
		['add food', addFoodConversation],
		['correct food', correctFoodConversation],
		['delete food', deleteFoodConversation],
	])(
		'%s stops before querying pets for an unregistered user',
		async (_, conversation) => {
			const ctx = createContext();

			await conversation(createConversation(ctx) as never, ctx as never);

			expect(ctx.reply).toHaveBeenCalledWith(registrationMessage);
			expect(mocks.getUserOwnedPets).not.toHaveBeenCalled();
			expect(mocks.getUserCaredPets).not.toHaveBeenCalled();
		},
	);

	it('stops the delete food conversation when the user has no pets', async () => {
		const ctx = createContext({ id: 'user-1' });

		await deleteFoodConversation(
			createConversation(ctx) as never,
			ctx as never,
		);

		expect(ctx.reply).toHaveBeenCalledWith('Você não possui nenhum pet');
	});

	it('stops the day start conversation when the user owns no pets', async () => {
		const ctx = createContext({ id: 'user-1' });

		await setDayStartConversation(
			createConversation(ctx) as never,
			ctx as never,
		);

		expect(ctx.reply).toHaveBeenCalledWith(
			'Você ainda não cadastrou nenhum pet.',
		);
	});
});
