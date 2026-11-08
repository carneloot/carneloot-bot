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
	getUserByID: vi.fn(),
	getUserByUsername: vi.fn(),
	isUserCarer: vi.fn(),
	removeCarer: vi.fn(),
	showOptionsKeyboard: vi.fn(),
	showYesOrNoQuestion: vi.fn(),
}));

vi.mock('../../../src/common/utils/show-options-keyboard.js', () => ({
	showOptionsKeyboard: mocks.showOptionsKeyboard,
}));

vi.mock('../../../src/common/utils/show-yes-or-no-question.js', () => ({
	showYesOrNoQuestion: mocks.showYesOrNoQuestion,
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
	getUserByID: mocks.getUserByID,
	getUserByUsername: mocks.getUserByUsername,
}));

import { addCarerConversation } from '../../../src/modules/pet/add-carer.command.js';
import { addPetConversation } from '../../../src/modules/pet/add-pet.command.js';
import { deletePetConversation } from '../../../src/modules/pet/delete-pet.command.js';
import { listCarersConversation } from '../../../src/modules/pet/list-carers.command.js';
import { petInvitesConversation } from '../../../src/modules/pet/pet-invites.command.js';
import { removeCarerConversation } from '../../../src/modules/pet/remove-carer.command.js';
import { stopCaringConversation } from '../../../src/modules/pet/stop-caring.command.js';

const pet = { id: 'pet-1', name: 'Luna', ownerID: 'owner-1' };

const makeConversation = (ctx: unknown, text = 'Luna') => ({
	external: vi.fn(async (callback: (context: unknown) => unknown) =>
		callback(ctx),
	),
	form: { text: vi.fn().mockResolvedValue(text) },
});

describe('pet conversations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.showOptionsKeyboard.mockReturnValue(async () => pet);
		mocks.showYesOrNoQuestion.mockReturnValue(async () => false);
	});

	it('creates a pet from the submitted name', async () => {
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'owner-1' },
		};
		const cvs = makeConversation(ctx, 'Milo');

		await addPetConversation(cvs as never, ctx as never);

		expect(mocks.createPet).toHaveBeenCalledWith('Milo', 'owner-1');
		expect(ctx.reply).toHaveBeenNthCalledWith(1, 'Qual o nome do seu pet?');
		expect(ctx.reply).toHaveBeenLastCalledWith('Pet cadastrado com sucesso!');
	});

	it('does not delete a pet when deletion is declined', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([pet]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'owner-1' },
		};
		const cvs = makeConversation(ctx);

		await deletePetConversation(cvs as never, ctx as never);

		expect(mocks.showYesOrNoQuestion).toHaveBeenCalledWith(
			'Você tem certeza que deseja deletar o pet Luna?',
		);
		expect(mocks.deletePet).not.toHaveBeenCalled();
	});

	it('rejects adding the owner as a carer', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([pet]);
		const ctx = {
			from: { username: 'owner' },
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'owner-1' },
		};
		const cvs = makeConversation(ctx, 'owner');

		await addCarerConversation(cvs as never, ctx as never);

		expect(ctx.reply).toHaveBeenLastCalledWith(
			'Você não pode adicionar a si mesmo como cuidador.',
		);
		expect(mocks.addCarer).not.toHaveBeenCalled();
	});

	it('reports an empty carer list for the selected pet', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([pet]);
		mocks.getPetCarers.mockResolvedValue([]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'owner-1' },
		};

		await listCarersConversation(makeConversation(ctx) as never, ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith('Este pet não tem cuidadores');
	});

	it('reports no carers to remove for the selected pet', async () => {
		mocks.getUserOwnedPets.mockResolvedValue([pet]);
		mocks.getPetCarers.mockResolvedValue([]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'owner-1' },
		};

		await removeCarerConversation(makeConversation(ctx) as never, ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith('Este pet não tem cuidadores');
		expect(mocks.removeCarer).not.toHaveBeenCalled();
	});

	it('reports no pending invitations before showing a selection', async () => {
		mocks.getPendingPetInvites.mockResolvedValue([]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'carer-1' },
		};

		await petInvitesConversation(makeConversation(ctx) as never, ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith('Você não tem convites pendentes.');
		expect(mocks.showOptionsKeyboard).not.toHaveBeenCalled();
	});

	it('reports when the user is not caring for any pets', async () => {
		mocks.getUserCaredPets.mockResolvedValue([]);
		const ctx = {
			reply: vi.fn().mockResolvedValue(undefined),
			user: { id: 'carer-1' },
		};

		await stopCaringConversation(makeConversation(ctx) as never, ctx as never);

		expect(ctx.reply).toHaveBeenCalledWith(
			'Você não está cuidando de nenhum pet',
		);
		expect(mocks.removeCarer).not.toHaveBeenCalled();
	});
});
