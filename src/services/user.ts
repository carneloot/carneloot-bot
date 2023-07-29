import type { User as TelegramUser } from '@grammyjs/types';
import { prisma } from './prisma';
import { User } from '@prisma/client';

export const createUser = (user: TelegramUser) => {
	return prisma.user.create({
		data: {
			telegramID: user.id,
			username: user.username,
			firstName: user.first_name,
			lastName: user.last_name
		}
	});
};

export const getUserByTelegramID = (telegramID: User['telegramID']) => {
	return prisma.user.findUnique({ where: { telegramID } });
};
