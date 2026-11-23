import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import type { Execute } from '../../../../src/adapters/execute.js';
import { createFoodStatusCommand } from '../../../../src/adapters/telegram/pet-food/food-status.js';
import {
	AddFoodCommand,
	CorrectFoodCommand,
	createPetFoodConversations,
	DeleteFoodCommand,
	SetDayStartCommand,
	SetNotificationDelayCommand,
} from '../../../../src/adapters/telegram/pet-food/index.js';
import type { AppServices } from '../../../../src/app/layer.js';
import { PetRepository } from '../../../../src/lib/repositories/pet.js';

const registrationMessage =
	'Por favor cadastre-se primeiro utilizando /cadastrar';
const createContext = (registered = false) => ({
	conversation: { enter: vi.fn().mockResolvedValue(undefined) },
	reply: vi.fn().mockResolvedValue(undefined),
	user: registered
		? {
				id: 'user-1',
				telegramID: '42',
				firstName: 'Ana',
				lastName: null,
				username: null,
			}
		: undefined,
});

const createConversation = (ctx: unknown) => ({
	external: async <A>(operation: {
		task: (context: unknown) => Promise<A>;
		beforeStore: (value: A) => Promise<unknown>;
		afterLoad: (value: unknown) => Promise<A>;
	}) =>
		operation.afterLoad(
			JSON.parse(
				JSON.stringify(await operation.beforeStore(await operation.task(ctx))),
			),
		),
});

const setup = () => {
	const repository = {
		getUserOwnedPets: vi.fn<PetRepository['getUserOwnedPets']>(() =>
			Effect.succeed([]),
		),
		getUserCaredPets: vi.fn<PetRepository['getUserCaredPets']>(() =>
			Effect.succeed([]),
		),
	};
	const layer = Layer.mock(PetRepository, repository);
	// Other app services are deliberately absent so unexpected downstream work fails.
	const execute = (<A, E>(effect: Effect.Effect<A, E, PetRepository>) =>
		Effect.runPromise(
			effect.pipe(Effect.provide(layer)),
		)) as Execute<AppServices>;
	return { repository, execute, flows: createPetFoodConversations(execute) };
};

const guardedCommands = [
	{ name: 'correctFood', command: CorrectFoodCommand },
	{ name: 'setDayStart', command: SetDayStartCommand },
	{ name: 'setNotificationDelay', command: SetNotificationDelayCommand },
];

describe('pet food command entry points', () => {
	it('enters the add food conversation', async () => {
		const ctx = createContext(true);
		await AddFoodCommand(ctx as never, vi.fn());
		expect(ctx.conversation.enter).toHaveBeenCalledWith('addFood', {
			overwrite: false,
		});
	});

	it('enters the delete food conversation with overwrite enabled', async () => {
		const ctx = createContext(true);
		await DeleteFoodCommand(ctx as never, vi.fn());
		expect(ctx.conversation.enter).toHaveBeenCalledWith('deleteFood', {
			overwrite: true,
		});
	});

	it.each([
		...guardedCommands,
		{ name: 'addFood', command: AddFoodCommand },
		{ name: 'deleteFood', command: DeleteFoodCommand },
	])('$name guards unregistered users', async ({ command }) => {
		const ctx = createContext();
		await command(ctx as never, vi.fn());
		expect(ctx.reply).toHaveBeenCalledWith(registrationMessage);
		expect(ctx.conversation.enter).not.toHaveBeenCalled();
	});

	it.each(guardedCommands)(
		'$name enters its conversation for registered users',
		async ({ command, name }) => {
			const ctx = createContext(true);
			await command(ctx as never, vi.fn());
			expect(ctx.conversation.enter).toHaveBeenCalledWith(name, {
				overwrite: true,
			});
		},
	);

	it('replies with registration message when FoodStatus is called directly by an unregistered user', async () => {
		const { execute, repository } = setup();
		const ctx = createContext();
		await createFoodStatusCommand(execute)(ctx as never);
		expect(ctx.reply).toHaveBeenCalledWith(registrationMessage);
		expect(repository.getUserOwnedPets).not.toHaveBeenCalled();
		expect(repository.getUserCaredPets).not.toHaveBeenCalled();
	});
});

describe('pet food conversation guards', () => {
	it.each([
		'addFoodConversation',
		'correctFoodConversation',
		'deleteFoodConversation',
		'setDayStartConversation',
		'setNotificationDelayConversation',
	] as const)(
		'%s stops before querying pets for an unregistered user',
		async (name) => {
			const { flows, repository } = setup();
			const ctx = createContext();
			await flows[name](createConversation(ctx) as never, ctx as never);
			expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(registrationMessage);
			expect(repository.getUserOwnedPets).not.toHaveBeenCalled();
			expect(repository.getUserCaredPets).not.toHaveBeenCalled();
		},
	);

	it('stops the delete food conversation when the user has no pets', async () => {
		const { flows, repository } = setup();
		const ctx = createContext(true);
		await flows.deleteFoodConversation(
			createConversation(ctx) as never,
			ctx as never,
		);
		expect(ctx.reply).toHaveBeenCalledWith('Você não possui nenhum pet');
		expect(repository.getUserOwnedPets).toHaveBeenCalledWith('user-1');
		expect(repository.getUserCaredPets).toHaveBeenCalledWith('user-1');
	});

	it('stops the day start conversation when the user owns no pets', async () => {
		const { flows, repository } = setup();
		const ctx = createContext(true);
		await flows.setDayStartConversation(
			createConversation(ctx) as never,
			ctx as never,
		);
		expect(ctx.reply).toHaveBeenCalledWith(
			'Você ainda não cadastrou nenhum pet.',
		);
		expect(repository.getUserOwnedPets).toHaveBeenCalledWith('user-1');
	});
});
