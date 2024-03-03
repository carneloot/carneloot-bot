import { createConversation } from '@grammyjs/conversations';

import { Module } from '../../common/module/module';
import { Context } from '../../common/types/context';

import { UserMiddleware } from '../../middlewares/user.middleware';

import { ListPetsCommand } from './list-pets.command';
import { AddPetCommand, addPetConversation } from './add-pet.command';
import { AddCarerCommand, addCarerConversation } from './add-carer.command';
import { PetInvitesCommand, petInvitesConversation } from './pet-invites.command';
import { DeletePetCommand, deletePetConversation } from './delete-pet.command';
import { RemoveCarerCommand, removeCarerConversation } from './remove-carer.command';
import { ListCarersCommand, listCarersConversation } from './list-carers.command';
import { StopCaringCommand, stopCaringConversation } from './stop-caring.command';

export const PetModule = new Module<Context>('', 'Opções de gerenciamento de pet');

// Add pet
PetModule.use(createConversation(addPetConversation, 'addPet'));
PetModule.setCommand(
	'adicionar_pet',
	'Adiciona um pet ao seu usuário',
	UserMiddleware,
	AddPetCommand
);

// Delete pet
PetModule.use(createConversation(deletePetConversation, 'deletePet'));
PetModule.setCommand(
	'deletar_pet',
	'Deleta um pet do seu usuário',
	UserMiddleware,
	DeletePetCommand
);

// List pets
PetModule.setCommand('listar_pets', 'Lista os seus pets', UserMiddleware, ListPetsCommand);

// Add carer
PetModule.use(createConversation(addCarerConversation, 'addCarer'));
PetModule.setCommand(
	'adicionar_cuidador',
	'Adiciona um cuidador para um pet',
	UserMiddleware,
	AddCarerCommand
);

// Remove carer
PetModule.use(createConversation(removeCarerConversation, 'removeCarer'));
PetModule.setCommand(
	'remover_cuidador',
	'Remove um cuidador de um pet',
	UserMiddleware,
	RemoveCarerCommand
);

// List carers
PetModule.use(createConversation(listCarersConversation, 'listCarers'));
PetModule.setCommand(
	'listar_cuidadores',
	'Lista os cuidadores de um pet',
	UserMiddleware,
	ListCarersCommand
);

// Invites
PetModule.use(createConversation(petInvitesConversation, 'petInvites'));
PetModule.setCommand(
	'convites_pet',
	'Lista os convites para cuidar de um pet',
	UserMiddleware,
	PetInvitesCommand
);

// Stop caring
PetModule.use(createConversation(stopCaringConversation, 'stopCaring'));
PetModule.setCommand(
	'parar_de_cuidar_pet',
	'Para de cuidar de um pet',
	UserMiddleware,
	StopCaringCommand
);
