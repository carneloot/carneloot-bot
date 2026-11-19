import { createConversation } from '@grammyjs/conversations';

import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import {
	CreateNotificationCommand,
	createNotificationConversation,
} from './create-notification.command.js';

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
