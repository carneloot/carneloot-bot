import { Menu } from '@grammyjs/menu';
import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';
import invariant from 'tiny-invariant';

import type { Context } from '../../common/types/context.js';
import { UserRepository } from '../../lib/repositories/user.js';
import type { Execute } from '../execute.js';

const generateApiKeyAndSend = (
	execute: Execute<UserRepository>,
	ctx: Context,
) => {
	const user = ctx.user;
	invariant(user, 'User is not defined');

	return execute(
		Effect.gen(function* () {
			const users = yield* UserRepository;
			const apiKey = yield* users.generateApiKeyForUser(user.id);

			yield* Effect.promise(() =>
				ctx.reply(`Aqui está: <pre>${apiKey}</pre>`, { parse_mode: 'HTML' }),
			);
		}),
	);
};

export const createApiKeyConfirmationMenu = (
	execute: Execute<UserRepository>,
) =>
	new Menu<Context>('api-key-confirmation')
		.text('Yes', async (ctx) => {
			await generateApiKeyAndSend(execute, ctx);

			ctx.menu.close();
		})
		.text('No', async (ctx) => {
			await ctx.reply('Okay!');
			ctx.menu.close();
		});

export const createSignupCommand =
	(execute: Execute<UserRepository>): MiddlewareFn<Context> =>
	async (ctx) => {
		const user = ctx.from;

		if (!user) {
			await ctx.reply('Não foi possível identificar o usuário.');
			return;
		}

		await execute(
			Effect.gen(function* () {
				const users = yield* UserRepository;
				yield* users.createUser(user);
				yield* Effect.promise(() =>
					ctx.reply('Usuário cadastrado com sucesso!'),
				);
			}),
		);
	};

export const createGenerateApiKeyCommand =
	(
		execute: Execute<UserRepository>,
		apiKeyConfirmationMenu: Menu<Context>,
	): MiddlewareFn<Context> =>
	async (ctx) => {
		const user = ctx.user;
		if (!user) {
			await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
			return;
		}

		const hasApiKey = await execute(
			Effect.gen(function* () {
				const users = yield* UserRepository;
				return yield* users.userHasApiKey(user.id);
			}),
		);

		if (!hasApiKey) {
			await generateApiKeyAndSend(execute, ctx);
			return;
		}

		await ctx.reply(
			'Você já possui uma API Key. Deseja gerar uma nova? A outra chave será invalidada.',
			{ reply_markup: apiKeyConfirmationMenu },
		);
	};
