import type { User as TelegramUser } from '@grammyjs/types';
import { User } from '../../lib/user';

export const getUserDisplay = (user: TelegramUser | User) => {
	const isDbUser = 'telegramID' in user;
	const username = user.username;
	const firstName = isDbUser ? user.firstName : user.first_name;
	const lastName = isDbUser ? user.lastName : user.last_name;

	return username ? `@${username}` : lastName ? `${firstName} ${lastName}` : firstName;
};
