import { Module } from '../../common/module/module.js';
import { Context } from '../../common/types/context.js';
import { createConversation } from '@grammyjs/conversations';
import { SetDayStartCommand, setDayStartConversation } from './set-day-start.command.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import { FoodStatusCommand } from './food-status.command.js';
import { AddFoodCommand } from './add-food.command.js';
import {
	ChooseCurrentPetCommand,
	chooseCurrentPetConversation
} from './choose-current-pet.command.js';
import {
	SetNotificationDelayCommand,
	setNotificationDelayConversation
} from './set-notification-delay.command.js';
import { CorrectFoodCommand, correctFoodConversation } from './correct-food.command.js';

export const PetFoodModule = new Module<Context>('', 'Operações de rastreamento de ração');

// Set start of day to calculate daily food consumption
PetFoodModule.use(createConversation(setDayStartConversation, 'setDayStart'));
PetFoodModule.setCommand(
	'configurar_inicio_dia',
	'Configura o horário de início do dia para rastreamento de ração',
	UserMiddleware,
	SetDayStartCommand
);

// Set notification delay
PetFoodModule.use(createConversation(setNotificationDelayConversation, 'setNotificationDelay'));
PetFoodModule.setCommand(
	'configurar_atraso_notificacao',
	'Configura o atraso de notificação para rastreamento de ração',
	UserMiddleware,
	SetNotificationDelayCommand
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

// Correct food
PetFoodModule.use(createConversation(correctFoodConversation, 'correctFood'));
PetFoodModule.setCommand(
	'corrigir_racao',
	'Corrige o valor e tempo de um comando de ração mandado anteriormente',
	UserMiddleware,
	CorrectFoodCommand
);
