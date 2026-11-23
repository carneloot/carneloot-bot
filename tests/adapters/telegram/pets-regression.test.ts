import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	process.env.BOT_TOKEN = 'test-token';
	process.env.DATABASE_URL = 'file::memory:';
	process.env.REDIS_URL = 'redis://localhost:6379';
});

import type { Execute } from '../../../src/adapters/execute.js';
import { createListPetsCommand } from '../../../src/adapters/telegram/list-pets.js';
import {
	createPetCommand,
	createPetConversations,
} from '../../../src/adapters/telegram/pets/index.js';
import type { AppServices } from '../../../src/app/layer.js';
import type { UserID, PetID } from '../../../src/lib/database/schema.js';
import { PetRepository } from '../../../src/lib/repositories/pet.js';

const registrationPrompt =
	'Por favor cadastre-se primeiro utilizando /cadastrar';
const user = {
	id: 'owner-1' as UserID,
	telegramID: '42',
	username: 'owner',
	firstName: 'Ana',
	lastName: null,
};
const pet = { id: 'pet-1' as PetID, name: 'Luna', ownerID: user.id };
const commands = [
	{ name: 'addPet' },
	{ name: 'deletePet' },
	{ name: 'addCarer', options: { overwrite: true } },
	{ name: 'removeCarer', options: { overwrite: true } },
	{ name: 'listCarers', options: { overwrite: true } },
	{ name: 'petInvites', options: { overwrite: true } },
	{ name: 'stopCaring' },
];

const makeContext = (registered = true) => ({
	user: registered ? user : undefined,
	conversation: { enter: vi.fn().mockResolvedValue(undefined) },
	reply: vi.fn().mockResolvedValue({ chat: { id: 42 }, message_id: 1 }),
	api: { editMessageText: vi.fn().mockResolvedValue(undefined) },
});

// Exercise the real keyboard helpers and JSON persistence codecs at the Telegram boundary.
const makeConversation = (ctx: unknown, text = 'Luna', choices = [0]) => ({
	external: vi.fn(
		async <A>(operation: {
			task: (context: unknown) => Promise<A>;
			beforeStore: (value: A) => Promise<unknown>;
			afterLoad: (value: unknown) => Promise<A>;
		}) =>
			operation.afterLoad(
				JSON.parse(
					JSON.stringify(
						await operation.beforeStore(await operation.task(ctx)),
					),
				),
			),
	),
	waitFrom: vi.fn(() => ({
		andFor: vi.fn().mockResolvedValue({ message: { text } }),
	})),
	waitForCallbackQuery: vi.fn(() => ({
		and: async (predicate: (context: { from: { id: number } }) => boolean) => {
			expect(predicate({ from: { id: 42 } })).toBe(true);
			expect(predicate({ from: { id: 99 } })).toBe(false);
			return {
				match: ['values', String(choices.shift() ?? 0)],
				answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
			};
		},
	})),
});

const setup = () => {
	const repository = {
		getUserOwnedPets: vi.fn<PetRepository['getUserOwnedPets']>(() =>
			Effect.succeed([]),
		),
		getUserCaredPets: vi.fn<PetRepository['getUserCaredPets']>(() =>
			Effect.succeed([]),
		),
		createPet: vi.fn<PetRepository['createPet']>(() => Effect.void),
		deletePet: vi.fn<PetRepository['deletePet']>(),
		addCarer: vi.fn<PetRepository['addCarer']>(),
		removeCarer: vi.fn<PetRepository['removeCarer']>(),
		getPetCarers: vi.fn<PetRepository['getPetCarers']>(() =>
			Effect.succeed([]),
		),
		getPendingPetInvites: vi.fn<PetRepository['getPendingPetInvites']>(() =>
			Effect.succeed([]),
		),
	};
	const layer = Layer.mock(PetRepository, repository);
	// These flows need only PetRepository. All other app services remain absent and fail if used.
	const execute = (<A, E>(effect: Effect.Effect<A, E, PetRepository>) =>
		Effect.runPromise(
			effect.pipe(Effect.provide(layer)),
		)) as Execute<AppServices>;
	return { repository, execute, flows: createPetConversations(execute) };
};

describe('pet commands', () => {
	it.each(commands)(
		'$name opens its conversation for an authenticated user',
		async ({ name, options }) => {
			const ctx = makeContext();
			await createPetCommand(name, options)(ctx as never, vi.fn());
			expect(ctx.conversation.enter).toHaveBeenCalledWith(name, options);
			expect(ctx.reply).not.toHaveBeenCalled();
		},
	);

	it.each([...commands.map(({ name }) => name), 'listPets'])(
		'%s requires registration before handling a request',
		async (name) => {
			const { repository, execute } = setup();
			const ctx = makeContext(false);
			const command =
				name === 'listPets'
					? createListPetsCommand(execute)
					: createPetCommand(name);
			await command(ctx as never, vi.fn());
			expect(ctx.reply).toHaveBeenCalledWith(registrationPrompt);
			expect(ctx.conversation.enter).not.toHaveBeenCalled();
			expect(repository.getUserOwnedPets).not.toHaveBeenCalled();
			expect(repository.getUserCaredPets).not.toHaveBeenCalled();
		},
	);

	it('reports the authenticated empty pet list without entering a conversation', async () => {
		const { repository, execute } = setup();
		const ctx = makeContext();
		await createListPetsCommand(execute)(ctx as never, vi.fn());
		expect(repository.getUserOwnedPets).toHaveBeenCalledWith(user.id);
		expect(repository.getUserCaredPets).toHaveBeenCalledWith(user.id);
		expect(ctx.reply).toHaveBeenCalledWith('Você não tem pets');
		expect(ctx.conversation.enter).not.toHaveBeenCalled();
	});
});

describe('pet conversations', () => {
	it('creates a pet from the submitted name', async () => {
		const { repository, flows } = setup();
		const ctx = makeContext();
		const cvs = makeConversation(ctx, 'Milo');
		await flows.addPetConversation(cvs as never, ctx as never);
		expect(repository.createPet).toHaveBeenCalledWith('Milo', user.id);
		expect(ctx.reply).toHaveBeenNthCalledWith(1, 'Qual o nome do seu pet?');
		expect(ctx.reply).toHaveBeenLastCalledWith('Pet cadastrado com sucesso!');
		expect(cvs.waitFrom).toHaveBeenCalledWith(42);
	});

	it('does not delete a pet when deletion is declined', async () => {
		const { repository, flows } = setup();
		repository.getUserOwnedPets.mockReturnValue(Effect.succeed([pet]));
		const ctx = makeContext();
		await flows.deletePetConversation(
			makeConversation(ctx, 'Luna', [0, 1]) as never,
			ctx as never,
		);
		expect(ctx.reply).toHaveBeenCalledWith(
			'Você tem certeza que deseja deletar o pet Luna?',
			expect.anything(),
		);
		expect(repository.deletePet).not.toHaveBeenCalled();
	});

	it('rejects adding the owner as a carer', async () => {
		const { repository, flows } = setup();
		repository.getUserOwnedPets.mockReturnValue(Effect.succeed([pet]));
		const ctx = makeContext();
		await flows.addCarerConversation(
			makeConversation(ctx, 'owner') as never,
			ctx as never,
		);
		expect(ctx.reply).toHaveBeenLastCalledWith(
			'Você não pode adicionar a si mesmo como cuidador.',
		);
		expect(repository.addCarer).not.toHaveBeenCalled();
	});

	it.each(['listCarersConversation', 'removeCarerConversation'] as const)(
		'%s reports an empty carer list for the selected pet',
		async (name) => {
			const { repository, flows } = setup();
			repository.getUserOwnedPets.mockReturnValue(Effect.succeed([pet]));
			const ctx = makeContext();
			await flows[name](makeConversation(ctx) as never, ctx as never);
			expect(repository.getPetCarers).toHaveBeenCalledWith(pet.id);
			expect(ctx.reply).toHaveBeenCalledWith('Este pet não tem cuidadores');
			expect(repository.removeCarer).not.toHaveBeenCalled();
		},
	);

	it('reports no pending invitations before showing a selection', async () => {
		const { flows } = setup();
		const ctx = makeContext();
		const cvs = makeConversation(ctx);
		await flows.petInvitesConversation(cvs as never, ctx as never);
		expect(ctx.reply).toHaveBeenCalledWith('Você não tem convites pendentes.');
		expect(cvs.waitForCallbackQuery).not.toHaveBeenCalled();
	});

	it('reports when the user is not caring for any pets', async () => {
		const { repository, flows } = setup();
		const ctx = makeContext();
		await flows.stopCaringConversation(
			makeConversation(ctx) as never,
			ctx as never,
		);
		expect(ctx.reply).toHaveBeenCalledWith(
			'Você não está cuidando de nenhum pet',
		);
		expect(repository.removeCarer).not.toHaveBeenCalled();
	});

	it.each(commands)(
		'$name conversation exits before accessing repositories without a user',
		async ({ name }) => {
			const { repository, flows } = setup();
			const ctx = makeContext(false);
			const flow = Object.entries(flows).find(
				([key]) => key === `${name}Conversation`,
			)?.[1];
			expect(flow).toBeDefined();
			await flow?.(makeConversation(ctx) as never, ctx as never);
			expect(ctx.reply).toHaveBeenCalledExactlyOnceWith(registrationPrompt);
			for (const method of Object.values(repository))
				expect(method).not.toHaveBeenCalled();
		},
	);
});
