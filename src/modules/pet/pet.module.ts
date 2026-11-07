import { createConversation } from '@grammyjs/conversations';
import type { MiddlewareFn } from 'grammy';

import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { AddCarerCommand, addCarerConversation } from './add-carer.command.js';
import { AddPetCommand, addPetConversation } from './add-pet.command.js';
import {
	DeletePetCommand,
	deletePetConversation,
} from './delete-pet.command.js';
import {
	ListCarersCommand,
	listCarersConversation,
} from './list-carers.command.js';
import {
	PetInvitesCommand,
	petInvitesConversation,
} from './pet-invites.command.js';
import {
	RemoveCarerCommand,
	removeCarerConversation,
} from './remove-carer.command.js';
import {
	StopCaringCommand,
	stopCaringConversation,
} from './stop-caring.command.js';

export const createPetModule = (userMiddleware: MiddlewareFn<Context>) => {
	const petModule = new Module<Context>('', 'Opções de gerenciamento de pet');

	// Add pet
	petModule.use(createConversation(addPetConversation, 'addPet'));
	petModule.setCommand(
		'adicionar_pet',
		'Adiciona um pet ao seu usuário',
		userMiddleware,
		AddPetCommand,
	);

	// Delete pet
	petModule.use(createConversation(deletePetConversation, 'deletePet'));
	petModule.setCommand(
		'deletar_pet',
		'Deleta um pet do seu usuário',
		userMiddleware,
		DeletePetCommand,
	);

	// Add carer
	petModule.use(createConversation(addCarerConversation, 'addCarer'));
	petModule.setCommand(
		'adicionar_cuidador',
		'Adiciona um cuidador para um pet',
		userMiddleware,
		AddCarerCommand,
	);

	// Remove carer
	petModule.use(createConversation(removeCarerConversation, 'removeCarer'));
	petModule.setCommand(
		'remover_cuidador',
		'Remove um cuidador de um pet',
		userMiddleware,
		RemoveCarerCommand,
	);

	// List carers
	petModule.use(createConversation(listCarersConversation, 'listCarers'));
	petModule.setCommand(
		'listar_cuidadores',
		'Lista os cuidadores de um pet',
		userMiddleware,
		ListCarersCommand,
	);

	// Invites
	petModule.use(createConversation(petInvitesConversation, 'petInvites'));
	petModule.setCommand(
		'convites_pet',
		'Lista os convites para cuidar de um pet',
		userMiddleware,
		PetInvitesCommand,
	);

	// Stop caring
	petModule.use(createConversation(stopCaringConversation, 'stopCaring'));
	petModule.setCommand(
		'parar_de_cuidar_pet',
		'Para de cuidar de um pet',
		userMiddleware,
		StopCaringCommand,
	);

	return petModule;
};
