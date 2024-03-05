import { Context } from 'grammy';
import { UserResponse } from './response.js';
import { randomItem } from '../utils/random-item.js';
import { sendResponse } from './send-response.js';

export const sendRandomResponse = async (ctx: Context, responses: UserResponse[]) => {
	const response = randomItem(responses);
	return await sendResponse(ctx, response);
};
