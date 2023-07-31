import { MiddlewareFn } from 'grammy';
import { createUser } from '../../lib/user';

export const SignupCommand: MiddlewareFn = async (ctx) => {
	const user = ctx.from;

	if (!user) {
		await ctx.reply('Não foi possível identificar o usuário.');
		return;
	}

	await createUser(user);

	await ctx.reply('Usuário cadastrado com sucesso!');
};
