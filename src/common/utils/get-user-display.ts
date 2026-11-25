import type { User as TelegramUser } from '@grammyjs/types';

type StoredUser = {
	telegramID: string;
	username: string | null;
	firstName: string;
	lastName: string | null;
};

export const getUserDisplay = (user: TelegramUser | StoredUser) => {
	const isDbUser = 'telegramID' in user;
	const username = user.username;
	const firstName = isDbUser ? user.firstName : user.first_name;
	const lastName = isDbUser ? user.lastName : user.last_name;

	return username
		? `@${username}`
		: lastName
			? `${firstName} ${lastName}`
			: firstName;
};
