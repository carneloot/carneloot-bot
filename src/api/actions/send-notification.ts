import { Bot } from 'grammy';
import { NotifyParams } from '../types/notify-params';
import { getNotificationByOwnerAndKeyword } from '../../services/notification';
import { getUserById, getUserFromApiKey } from '../../services/user';

export const sendNotification = async (bot: Bot, params: NotifyParams) => {
	const user = await getUserFromApiKey(params.apiKey);
	if (!user) {
		throw new Error(`User not found: "${params.apiKey}"`);
	}

	const notification = await getNotificationByOwnerAndKeyword(user.id!, params.keyword);

	if (!notification) {
		throw new Error(`Notification not found: "${params.keyword}"`);
	}

	const owner = await getUserById(notification.ownerId);
	const usersToNotifyIds = notification.usersToNotify?.split(',').map(parseInt) ?? [];
	const usersToNotify = await Promise.all(usersToNotifyIds.map(getUserById));

	const results = await Promise.allSettled([
		bot.api.sendMessage(owner.telegramID!, notification.message),
		...usersToNotify.map((user) => bot.api.sendMessage(user.telegramID!, notification.message))
	]);

	const errors = results.filter(
		(result) => result.status === 'rejected'
	) as PromiseRejectedResult[];

	if (errors.length) {
		errors.forEach((error) => {
			console.warn(`Failed to send message to user: ${error.reason}`);
		});
	}
};
