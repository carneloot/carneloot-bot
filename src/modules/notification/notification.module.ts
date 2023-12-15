import { Module } from '../../common/module/module';
import { Context } from '../../common/types/context';
import { UserMiddleware } from '../../middlewares/user.middleware';
import { handleNotificationReply } from './handle-notification-reply';
import { ReplyFilter } from '../../common/filters/reply.filter';

export const NotificationModule = new Module<Context>('', 'Operações de notificação');

NotificationModule.on('message', ReplyFilter, UserMiddleware, handleNotificationReply);
