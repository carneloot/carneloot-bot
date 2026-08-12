import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../common/types/context.js';
import { createForwardToOwnerMiddleware } from './forward-to-owner.middleware.js';

const createContext = (username?: string, isCommand = false) => {
	const calls: string[] = [];
	const sendMessage = vi.fn(() => calls.push('username'));
	const forwardMessage = vi.fn(() => calls.push('forward'));
	const context = {
		api: { sendMessage },
		forwardMessage,
		from: username ? { username } : undefined,
		message: {
			entities: isCommand ? [{ type: 'bot_command' }] : [],
		},
	} as unknown as Context;

	return { calls, context, forwardMessage, sendMessage };
};

describe('createForwardToOwnerMiddleware', () => {
	const middleware = createForwardToOwnerMiddleware({
		ownerChatId: 12345,
		usernames: ['user_one', 'user_two'],
	});

	it('forwards messages from configured usernames', async () => {
		const { calls, context, forwardMessage, sendMessage } =
			createContext('USER_TWO');
		const next = vi.fn();

		await middleware(context, next);

		expect(sendMessage).toHaveBeenCalledWith(12345, '@USER_TWO');
		expect(forwardMessage).toHaveBeenCalledWith(12345);
		expect(calls).toEqual(['username', 'forward']);
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
