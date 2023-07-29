import { Context } from 'grammy';
import { UserResponse } from './response';
import { randomItem } from '../utils/random-item';
import { sendResponse } from './send-response';

export const sendRandomResponse = async (ctx: Context, responses: UserResponse[]) => {
	const response = randomItem(responses);
	return await sendResponse(ctx, response);
};
