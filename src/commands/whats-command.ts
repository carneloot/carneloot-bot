import { Context } from 'grammy';
import { Command } from '../common/types/command';

const formatMessage = (message: string) => encodeURIComponent(message).replace(/!/g, '%21');

const phoneRegex = /^((?:(?:\+|00)?55\s?)?\(?[1-9][0-9]\)?\s?(?:9\d|[2-9])\d{3}[-\s]?\d{4})(?:\s(.*))?/;

async function sendMissingNumberMessage(ctx: Context) {
    await ctx.reply('Você precisa me enviar o telefone 😅');
}

export const WhatsCommand: Command<'whats'> = {
    command: 'whats',
    description: 'Gera um link para mandar mensagem no WhatsApp sem precisar adicionar o contato',
    middleware: () => async ctx => {
        if (!ctx.match) {
            await sendMissingNumberMessage(ctx);
            return;
        }

        const [ _, rawNumber, message ] = ctx.match
            .toString()
            .match(phoneRegex) ?? [];

        if (!rawNumber) {
            await sendMissingNumberMessage(ctx);
            return;
        }

        let number = rawNumber.replace(/[^0-9]/g, '');

        if (!number.startsWith('55')) {
            number = `55${number}`;
        }

        const whatsUrl = [
            'https://wa.me/',
            number
        ];

        if (message) {
            whatsUrl.push(`?text=${formatMessage(message)}`);
        }

        await ctx.reply(whatsUrl.join(''));
    }
};
