import { createConversation } from '@grammyjs/conversations';
import type { MiddlewareFn } from 'grammy';

import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { AddFoodAllCommand } from './add-food-all.command.js';
import { AddFoodCommand, addFoodConversation } from './add-food.command.js';
import {
	CorrectFoodCommand,
	correctFoodConversation,
} from './correct-food.command.js';
import {
	DeleteFoodCommand,
	deleteFoodConversation,
} from './delete-food.command.js';
import { FoodStatusCommand } from './food-status.command.js';
import {
	SetDayStartCommand,
	setDayStartConversation,
} from './set-day-start.command.js';
import {
	SetNotificationDelayCommand,
	setNotificationDelayConversation,
} from './set-notification-delay.command.js';

export const createPetFoodModule = (userMiddleware: MiddlewareFn<Context>) => {
	const petFoodModule = new Module<Context>(
		'',
		'Operações de rastreamento de ração',
	);

	// Set start of day to calculate daily food consumption
	petFoodModule.use(createConversation(setDayStartConversation, 'setDayStart'));
	petFoodModule.setCommand(
		'configurar_inicio_dia',
		'Configura o horário de início do dia para rastreamento de ração',
		userMiddleware,
		SetDayStartCommand,
	);

	// Set notification delay
	petFoodModule.use(
		createConversation(
			setNotificationDelayConversation,
			'setNotificationDelay',
		),
	);
	petFoodModule.setCommand(
		'configurar_atraso_notificacao',
		'Configura o atraso de notificação para rastreamento de ração',
		userMiddleware,
		SetNotificationDelayCommand,
	);

	// Food status
	petFoodModule.setCommand(
		'status_racao',
		'Exibe o status atual do rastreamento de ração',
		userMiddleware,
		FoodStatusCommand,
	);

	// Add food
	petFoodModule.use(createConversation(addFoodConversation, 'addFood'));
	petFoodModule.setCommand(
		'colocar_racao',
		'Adiciona ração ao rastreamento de ração',
		userMiddleware,
		AddFoodCommand,
	);

	// Add food to all
	petFoodModule.setCommand(
		['colocar_racao_todos', 'todos'],
		'Adiciona ração ao rastreamento de ração para todos os seus pets de uma vez',
		userMiddleware,
		AddFoodAllCommand,
	);

	// Delete food
	petFoodModule.use(createConversation(deleteFoodConversation, 'deleteFood'));
	petFoodModule.setCommand(
		'deletar_racao',
		'Deleta ração do rastreamento de ração',
		userMiddleware,
		DeleteFoodCommand,
	);

	// Correct food
	petFoodModule.use(createConversation(correctFoodConversation, 'correctFood'));
	petFoodModule.setCommand(
		'corrigir_racao',
		'Corrige o valor e tempo de um comando de ração mandado anteriormente',
		userMiddleware,
		CorrectFoodCommand,
	);

	return petFoodModule;
};
