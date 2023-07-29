import { Prisma } from '@prisma/client';

import randomstring from 'randomstring';

import { hashString } from '../common/utils/hash-string';
import { prisma } from './prisma';

export const generateApiKeyForUser = async (user: Prisma.UserWhereUniqueInput) => {
	const apiKey = randomstring.generate();
	const hashedApiKey = hashString(apiKey);
	await prisma.apiKey.create({
		data: {
			value: hashedApiKey,
			user: {
				connect: user
			}
		}
	});

	return apiKey;
};

export const getApiKeyFromUser = (input: Prisma.UserWhereUniqueInput) => {
	return prisma.user.findUnique({ where: input }).apiKey();
};

export const deleteApiKeyFromUser = async (input: Prisma.UserWhereUniqueInput) => {
	const user = await prisma.user.findUnique({
		where: input,
		select: {
			id: true
		}
	});

	if (!user) {
		throw new Error('User not found');
	}

	return prisma.apiKey.delete({
		where: {
			userId: user.id
		}
	});
};

export const getUserFromApiKey = (apiKey: string) => {
	const hashedApiKey = hashString(apiKey);
	return prisma.apiKey.findUnique({ where: { value: hashedApiKey } }).user();
};
