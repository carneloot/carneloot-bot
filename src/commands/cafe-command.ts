import { Context, MiddlewareFn } from 'grammy';
import { table } from 'table';

import Qty from 'js-quantities';

import { Command } from '../common/types/command';

async function sendMissingInformationMessage(ctx: Context) {
    await ctx.reply('Me envie a quantidade inicial de água em ml. 😄');
}

const COFFEE_WATER_RATIO = Qty('60g/L');

// TODO Add menus to start timers
// TODO Add timers on screen
export const CafeCommand: MiddlewareFn & Partial<Command<'cafe'>> = async ctx => {
    if (!ctx.match) {
        await sendMissingInformationMessage(ctx);
        return;
    }

    const waterAmountInVolume = Qty(ctx.match.toString());

    if (!waterAmountInVolume.isCompatible('1l')) {
        await sendMissingInformationMessage(ctx);
        return;
    }

    if (Math.random() <= 0.5) {
        await ctx.reply(`Lembre-se de molhar o filtro antes de colocar o café!`);
    }

    const coffeeWeightInWeight = COFFEE_WATER_RATIO.mul(waterAmountInVolume);
    const waterAmountInWeight = Qty(waterAmountInVolume.to('ml').scalar, 'g');

    await ctx.reply(`Quantidade de café: ${coffeeWeightInWeight.toPrec('g')}`);

    const firstWaterPourInWeight = coffeeWeightInWeight.mul(2);
    const secondWaterPourInWeight = waterAmountInWeight.mul(0.6).sub(firstWaterPourInWeight);
    const lastWaterPourInWeight = waterAmountInWeight.sub(secondWaterPourInWeight.add(firstWaterPourInWeight));

    const quantityDurationTable = [
        [ '#', 'Qtde.', 'Tempo' ],
        [ '1o', firstWaterPourInWeight.toPrec('g').toString(), 'Esperar 45 s' ],
        [ '2o', secondWaterPourInWeight.toPrec('g').toString(), 'Durante 30 s' ],
        [ '3o', lastWaterPourInWeight.toPrec('g').toString(), 'Durante 30 s' ],
    ];

    await ctx.reply(`<pre>${table(quantityDurationTable, {
        header: {
            content: 'Quantidade de água'
        },
        columns: [
            { alignment: 'center' },
            { alignment: 'right' },
            { alignment: 'right' },
        ]
    })}</pre>`, { parse_mode: 'HTML' });
}

CafeCommand.command = 'cafe';
CafeCommand.description = 'Calcula as proporções necessárias para fazer café com o filtro V60 de acordo com a quantidade inicial de água.';
