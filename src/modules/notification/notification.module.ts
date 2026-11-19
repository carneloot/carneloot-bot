import { createConversation } from '@grammyjs/conversations';

import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import {
	CreateNotificationCommand,
	createNotificationConversation,
} from './create-notification.command.js';
import {
	DeleteNotificationCommand,
	deleteNotificationConversation,
} from './delete-notification.command.js';
import {
	EditNotificationCommand,
	editNotificationConversation,
} from './edit-notification.command.js';
import { ListNotificationsCommand } from './list-notifications.command.js';

export const NotificationModule = new Module<Context>(
	'',
	'Opções de notificações',
);

NotificationModule.use(
	createConversation(createNotificationConversation, 'createNotification'),
);
NotificationModule.setCommand(
	'criar_notificacao',
	'Cria um modelo de notificação para usar pela API',
	UserMiddleware,
	CreateNotificationCommand,
);

NotificationModule.setCommand(
	'listar_notificacoes',
	'Lista seus modelos de notificação',
	UserMiddleware,
	ListNotificationsCommand,
);

NotificationModule.use(
	createConversation(editNotificationConversation, 'editNotification'),
);
NotificationModule.setCommand(
	'editar_notificacao',
	'Edita a mensagem de um modelo de notificação',
	UserMiddleware,
	EditNotificationCommand,
);

NotificationModule.use(
	createConversation(deleteNotificationConversation, 'deleteNotification'),
);
NotificationModule.setCommand(
	'deletar_notificacao',
	'Deleta um modelo de notificação',
	UserMiddleware,
	DeleteNotificationCommand,
);
