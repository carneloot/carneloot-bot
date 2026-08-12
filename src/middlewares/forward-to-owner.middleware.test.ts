import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../common/types/context.js';
import { createForwardToOwnerMiddleware } from './forward-to-owner.middleware.js';

const createContext = (username?: string, isCommand = false) => {
	const forwardMessage = vi.fn();
	const context = {
		forwardMessage,
		from: username ? { username } : undefined,
		message: {
			entities: isCommand ? [{ type: 'bot_command' }] : [],
		},
	} as unknown as Context;

	return { context, forwardMessage };
};

describe('createForwardToOwnerMiddleware', () => {
	const middleware = createForwardToOwnerMiddleware({
		ownerChatId: 12345,
		usernames: ' User_One, @user_two ',
	});

	it('forwards messages from configured usernames', async () => {
		const { context, forwardMessage } = createContext('USER_TWO');
		const next = vi.fn();

		await middleware(context, next);

		expect(forwardMessage).toHaveBeenCalledWith(12345);
		expect(next).toHaveBeenCalledOnce();
	});

	it('does not forward messages from other usernames', async () => {
		const { context, forwardMessage } = createContext('another_user');

		await middleware(context, vi.fn());

		expect(forwardMessage).not.toHaveBeenCalled();
	});

	it('does not forward commands', async () => {
		const { context, forwardMessage } = createContext('user_one', true);

		await middleware(context, vi.fn());

		expect(forwardMessage).not.toHaveBeenCalled();
	});

	it('does not forward messages from users without a username', async () => {
		const { context, forwardMessage } = createContext();

		await middleware(context, vi.fn());

		expect(forwardMessage).not.toHaveBeenCalled();
	});
});
