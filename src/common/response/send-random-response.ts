import type { Context } from 'grammy';
import { randomItem } from '../utils/random-item.js';
import type { UserResponse } from './response.js';
import { sendResponse } from './send-response.js';

export const sendRandomResponse = async (
	ctx: Context,
	responses: UserResponse[]
) => {
	const response = randomItem(responses);
	if (!response) {
		throw new Error('No response found');
	}
	return await sendResponse(ctx, response);
};
