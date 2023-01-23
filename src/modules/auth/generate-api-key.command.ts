import { Context, MiddlewareFn } from 'grammy';
import { Menu } from '@grammyjs/menu';
import { deleteApiKeyFromUser, generateApiKeyForUser, getApiKeyFromUser } from '../../services/api-key';
import { getUserByTelegramID } from '../../services/user';

async function generateApiKeyAndSend(ctx: Context) {
    const newApiKey = await generateApiKeyForUser({ telegramID: ctx.from!.id });

    await ctx.reply(`Here you go: <pre>${newApiKey}</pre>`, { parse_mode: 'HTML' });
}

export const apiKeyConfirmationMenu = new Menu('api-key-confirmation')
    .text('Yes', async ctx => {
        await deleteApiKeyFromUser({ telegramID: ctx.from!.id });

        await generateApiKeyAndSend(ctx);

        await ctx.menu.close();
    })
    .text('No', async ctx => {
        await ctx.reply('Okay!');
        await ctx.menu.close();
    });


export const GenerateApiKeyCommand: MiddlewareFn = async ctx => {
    const user = await getUserByTelegramID(ctx.from!.id);

    if (!user) {
        await ctx.reply('Please sign up first using /signup');
        return;
    }

    const apiKey = await getApiKeyFromUser({ telegramID: ctx.from!.id });

    if (!apiKey) {
        await generateApiKeyAndSend(ctx);
        return;
    }

    await ctx.reply(
        'You already have an api key. Do you want to regenerate it? The other api key will stop working.',
        { reply_markup: apiKeyConfirmationMenu }
    );
};
