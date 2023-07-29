import { MiddlewareFn } from 'grammy';
import { createUser } from '../../services/user';

export const SignupCommand: MiddlewareFn = async (ctx) => {
	const user = ctx.from;

	if (!user) {
		await ctx.reply('User could not be signed up.');
		return;
	}

	await createUser(user);

	await ctx.reply('User signed up successfully!');
};
