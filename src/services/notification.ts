import { Notification } from '@prisma/client';
import { prisma } from './prisma';

export const getNotificationByOwnerAndKeyword = async (
	ownerId: Notification['ownerId'],
	keyword: Notification['keyword']
) => {
	return prisma.notification.findFirst({
		where: { keyword, ownerId },
		select: {
			message: true,
			owner: {
				select: {
					telegramID: true
				}
			},
			usersToNotify: {
				select: {
					user: {
						select: {
							telegramID: true
						}
					}
				}
			}
		}
	});
};
