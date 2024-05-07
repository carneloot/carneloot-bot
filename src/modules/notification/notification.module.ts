import { Module } from '../../common/module/module.js';
import type { Context } from '../../common/types/context.js';
import { UserMiddleware } from '../../middlewares/user.middleware.js';
import { handleNotificationReply } from './handle-notification-reply.js';

export const NotificationModule = new Module<Context>(
	'notification',
	'Operações de notificação'
);

NotificationModule.on('message', UserMiddleware, handleNotificationReply);
