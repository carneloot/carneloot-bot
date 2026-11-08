import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	addCarer: vi.fn(),
	answerPendingPetInvite: vi.fn(),
	createPet: vi.fn(),
	deletePet: vi.fn(),
	getPendingPetInvites: vi.fn(),
	getPetCarers: vi.fn(),
	getUserCaredPets: vi.fn(),
	getUserOwnedPets: vi.fn(),
	isUserCarer: vi.fn(),
	removeCarer: vi.fn(),
}));

vi.mock('../../../src/lib/entities/pet.js', () => ({
	addCarer: mocks.addCarer,
	answerPendingPetInvite: mocks.answerPendingPetInvite,
	createPet: mocks.createPet,
	deletePet: mocks.deletePet,
	getPendingPetInvites: mocks.getPendingPetInvites,
	getPetCarers: mocks.getPetCarers,
	getUserCaredPets: mocks.getUserCaredPets,
	getUserOwnedPets: mocks.getUserOwnedPets,
	isUserCarer: mocks.isUserCarer,
	removeCarer: mocks.removeCarer,
}));

vi.mock('../../../src/lib/entities/user.js', () => ({
	getUserByID: vi.fn(),
	getUserByUsername: vi.fn(),
}));

import { AddCarerCommand } from '../../../src/modules/pet/add-carer.command.js';
import { AddPetCommand } from '../../../src/modules/pet/add-pet.command.js';
import { DeletePetCommand } from '../../../src/modules/pet/delete-pet.command.js';
import { ListCarersCommand } from '../../../src/modules/pet/list-carers.command.js';
import { ListPetsCommand } from '../../../src/modules/pet/list-pets.command.js';
import { PetInvitesCommand } from '../../../src/modules/pet/pet-invites.command.js';
import { RemoveCarerCommand } from '../../../src/modules/pet/remove-carer.command.js';
import { StopCaringCommand } from '../../../src/modules/pet/stop-caring.command.js';

const registrationPrompt =
	'Por favor cadastre-se primeiro utilizando /cadastrar';

const conversationCommands = [
	{ command: AddPetCommand, enterArgs: ['addPet'] },
	{ command: DeletePetCommand, enterArgs: ['deletePet'] },
	{ command: AddCarerCommand, enterArgs: ['addCarer', { overwrite: true }] },
	{
		command: RemoveCarerCommand,
		enterArgs: ['removeCarer', { overwrite: true }],
	},
	{
		command: ListCarersCommand,
		enterArgs: ['listCarers', { overwrite: true }],
	},
	{
		command: PetInvitesCommand,
		enterArgs: ['petInvites', { overwrite: true }],
	},
	{ command: StopCaringCommand, enterArgs: ['stopCaring'] },
];

describe('pet commands', () => {
	beforeEach(() => {
		mocks.getUserCaredPets.mockReset();
		mocks.getUserOwnedPets.mockReset();
	});

	it.each(conversationCommands)(
		'opens its conversation for an authenticated user',
		async ({ command, enterArgs }) => {
			const ctx = {
				conversation: { enter: vi.fn().mockResolvedValue(undefined) },
				reply: vi.fn().mockResolvedValue(undefined),
				user: { id: 'user-1' },
			};

			await command(ctx as never);

			expect(ctx.conversation.enter).toHaveBeenCalledWith(...enterArgs);
			expect(ctx.reply).not.toHaveBeenCalled();
		},
	);

	it.each([
		...conversationCommands.map(({ command }) => command),
		ListPetsCommand,
	])(
		'requires registration before handling an unauthenticated request',
		async (command) => {
			const ctx = { reply: vi.fn().mockResolvedValue(undefined) };

			await command(ctx as never);

			expect(ctx.reply).toHaveBeenCalledWith(registrationPrompt);
			expect(mocks.getUserOwnedPets).not.toHaveBeenCalled();
			expect(mocks.getUserCaredPets).not.toHaveBeenCalled();
		},
	);

	it('reports the authenticated empty pet list without entering a conversation', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([]);
		mocks.getUserCaredPets.mockResolvedValue([]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'user-1' },
		};

		await ListPetsCommand(ctx as never);

		expect(mocks.getUserOwnedPets).toHaveBeenCalledWith('user-1');
		expect(mocks.getUserCaredPets).toHaveBeenCalledWith('user-1');
		expect(ctx.reply).toHaveBeenCalledWith('Você não tem pets');
	});
});
