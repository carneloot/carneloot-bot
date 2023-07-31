import { MiddlewareFn } from 'grammy';
import { Menu } from '@grammyjs/menu';
import { Context } from '../../common/types/context';
import { generateApiKeyForUser, userHasApiKey } from '../../lib/user';

async function generateApiKeyAndSend(ctx: Context) {
	const newApiKey = await generateApiKeyForUser(ctx.user!.id);

	await ctx.reply(`Aqui está: <pre>${newApiKey}</pre>`, { parse_mode: 'HTML' });
}

export const apiKeyConfirmationMenu = new Menu<Context>('api-key-confirmation')
	.text('Yes', async (ctx) => {
		await generateApiKeyAndSend(ctx);

		ctx.menu.close();
	})
	.text('No', async (ctx) => {
		await ctx.reply('Okay!');
		ctx.menu.close();
	});

export const GenerateApiKeyCommand = (async (ctx) => {
	if (!ctx.user) {
		await ctx.reply('Por favor cadastre-se primeiro utilizando /cadastrar');
		return;
	}

	const hasApiKey = await userHasApiKey(ctx.user.id);

	if (!hasApiKey) {
		await generateApiKeyAndSend(ctx);
		return;
	}

	await ctx.reply(
		'Você já possui uma API Key. Deseja gerar uma nova? A outra chave será invalidada.',
		{ reply_markup: apiKeyConfirmationMenu }
	);
}) satisfies MiddlewareFn<Context>;
