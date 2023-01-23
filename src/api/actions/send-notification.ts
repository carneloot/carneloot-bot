import { Bot } from 'grammy';
import { NotifyParams } from '../types/notify-params';
import { getNotificationByOwnerAndKeyword } from '../../services/notification';
import { getUserFromApiKey } from '../../services/api-key';

export const sendNotification = async (bot: Bot, params: NotifyParams) => {
    const user = await getUserFromApiKey(params.apiKey);
    if (!user) {
        throw new Error(`User not found: "${params}"`);
    }

    const notification = await getNotificationByOwnerAndKeyword(user.id, params.keyword);

    if (!notification) {
        throw new Error(`Notification not found: "${params}"`);
    }

    const results = await Promise.allSettled([
        bot.api.sendMessage(notification.owner.telegramID, notification.message),
        ...notification.usersToNotify.map(({ user }) =>
            bot.api.sendMessage(user.telegramID, notification.message),
        )
    ]);

    const errors = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];

    if (errors.length) {
        errors.forEach(error => {
            console.warn(`Failed to send message to user: ${error.reason}`)
        });
    }
};
