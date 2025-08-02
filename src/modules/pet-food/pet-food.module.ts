import { createConversation } from '@grammyjs/conversations';
import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import { AddFoodCommand, addFoodConversation } from './add-food.command.js';
import { AddFoodAllCommand } from './add-food-all.command.js';
import {
	CorrectFoodCommand,
	correctFoodConversation
} from './correct-food.command.js';
import {
	DeleteFoodCommand,
	deleteFoodConversation
} from './delete-food.command.js';
import { FoodStatusCommand } from './food-status.command.js';
import {
	SetDayStartCommand,
	setDayStartConversation
} from './set-day-start.command.js';
import {
	SetNotificationDelayCommand,
	setNotificationDelayConversation
} from './set-notification-delay.command.js';

export const PetFoodModule = new Module<Context>(
	'',
	'Operações de rastreamento de ração'
);

// Set start of day to calculate daily food consumption
PetFoodModule.use(createConversation(setDayStartConversation, 'setDayStart'));
PetFoodModule.setCommand(
	'configurar_inicio_dia',
	'Configura o horário de início do dia para rastreamento de ração',
	UserMiddleware,
	SetDayStartCommand
);

// Set notification delay
PetFoodModule.use(
	createConversation(setNotificationDelayConversation, 'setNotificationDelay')
);
PetFoodModule.setCommand(
	'configurar_atraso_notificacao',
	'Configura o atraso de notificação para rastreamento de ração',
	UserMiddleware,
	SetNotificationDelayCommand
);

// Food status
PetFoodModule.setCommand(
	'status_racao',
	'Exibe o status atual do rastreamento de ração',
	UserMiddleware,
	FoodStatusCommand
);

// Add food
PetFoodModule.use(createConversation(addFoodConversation, 'addFood'));
PetFoodModule.setCommand(
	'colocar_racao',
	'Adiciona ração ao rastreamento de ração',
	UserMiddleware,
	AddFoodCommand
);

// Add food to all
PetFoodModule.setCommand(
	['colocar_racao_todos', 'todos'],
	'Adiciona ração ao rastreamento de ração para todos os seus pets de uma vez',
	UserMiddleware,
	AddFoodAllCommand
);

// Delete food
PetFoodModule.use(createConversation(deleteFoodConversation, 'deleteFood'));
PetFoodModule.setCommand(
	'deletar_racao',
	'Deleta ração do rastreamento de ração',
	UserMiddleware,
	DeleteFoodCommand
);

// Correct food
PetFoodModule.use(createConversation(correctFoodConversation, 'correctFood'));
PetFoodModule.setCommand(
	'corrigir_racao',
	'Corrige o valor e tempo de um comando de ração mandado anteriormente',
	UserMiddleware,
	CorrectFoodCommand
);
