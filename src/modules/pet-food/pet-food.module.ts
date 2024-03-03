import { Module } from '../../common/module/module';
import { Context } from '../../common/types/context';
import { createConversation } from '@grammyjs/conversations';
import { SetDayStartCommand, setDayStartConversation } from './set-day-start.command';
import { UserMiddleware } from '../../middlewares/user.middleware';
import { FoodStatusCommand } from './food-status.command';
import {
	ChooseCurrentPetCommand,
	chooseCurrentPetConversation
} from './choose-current-pet.command';
import { AddFoodCommand } from './add-food.command';

export const PetFoodModule = new Module<Context>('', 'Operações de rastreamento de ração');

// Set start of day to calculate daily food consumption
PetFoodModule.use(createConversation(setDayStartConversation, 'setDayStart'));
PetFoodModule.setCommand(
	'configurar_inicio_dia',
	'Configura o horário de início do dia para rastreamento de ração',
	UserMiddleware,
	SetDayStartCommand
);

// Chooses current pet
PetFoodModule.use(createConversation(chooseCurrentPetConversation, 'chooseCurrentPet'));
PetFoodModule.setCommand(
	'escolher_pet',
	'Escolhe o pet atual para rastreamento de ração',
	UserMiddleware,
	ChooseCurrentPetCommand
);

// Food status
PetFoodModule.setCommand(
	'status_racao',
	'Exibe o status atual do rastreamento de ração',
	UserMiddleware,
	FoodStatusCommand
);

// Add food
PetFoodModule.setCommand(
	'colocar_racao',
	'Adiciona ração ao rastreamento de ração',
	UserMiddleware,
	AddFoodCommand
);
