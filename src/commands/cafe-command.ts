import { Context } from 'grammy';
import { table } from 'table';

import Qty from 'js-quantities';

import { Command } from '../common/types/command';

async function sendMissingInformationMessage(ctx: Context) {
    await ctx.reply('Me envie a quantidade inicial de água em ml. 😄');
}

const COFFEE_WATER_RATIO = Qty('60g/L');

// TODO Add menus to start timers
// TODO Add timers on screen
export const CafeCommand: Command<'cafe'> = {
    command: 'cafe',
    description: 'Calcula as proporções necessárias para fazer café com o filtro V60 de acordo com a quantidade inicial de água.',
    middleware: () => async ctx => {
        if (!ctx.match) {
            await sendMissingInformationMessage(ctx);
            return;
        }

        const [ _, _waterAmount, _coffeeWaterRatio ] = ctx.match
            .toString()
            .match(/([0-9.,]+\w*)(?: +([0-9.,]+[\w\/]*))?/) ?? [];

        const waterAmountInVolume = _waterAmount
            ? _waterAmount.match(/^\d+$/)
                ? Qty(Number(_waterAmount), 'ml')
                : Qty(_waterAmount)
            : null

        if (!waterAmountInVolume || !waterAmountInVolume.isCompatible('ml')) {
            await sendMissingInformationMessage(ctx);
            return;
        }

        if (Math.random() <= 0.5) {
            await ctx.reply(`Lembre-se de molhar o filtro antes de colocar o café!`);
        }

        const coffeeWaterRatio = _coffeeWaterRatio
            ? _coffeeWaterRatio.match(/^\d+$/)
                ? Qty(Number(_coffeeWaterRatio), 'g/L')
                : Qty(_coffeeWaterRatio)
            : COFFEE_WATER_RATIO

        if (!coffeeWaterRatio.isCompatible('g/L')) {
            await ctx.reply('Proporção de café para quantidade água invalida. Por favor envie um valor na unidade g/L');
            return;
        }

        const coffeeWeightInWeight = coffeeWaterRatio.mul(waterAmountInVolume);
        const waterAmountInWeight = Qty(waterAmountInVolume.to('ml').scalar, 'g');


        await ctx.reply(`Quantidade de café: ${coffeeWeightInWeight.toPrec('g')}`);

        const firstWaterPourInWeight = coffeeWeightInWeight.mul(2);
        const secondWaterPourInWeight = waterAmountInWeight.mul(0.6).sub(firstWaterPourInWeight);
        const lastWaterPourInWeight = waterAmountInWeight.sub(secondWaterPourInWeight.add(firstWaterPourInWeight));

        const quantityDurationTable = [
            [ 'Qtde.', 'Tempo' ],
            [ firstWaterPourInWeight.toPrec('g').toString(), 'Esperar 45 s' ],
            [ secondWaterPourInWeight.toPrec('g').toString(), 'Durante 30 s' ],
            [ lastWaterPourInWeight.toPrec('g').toString(), 'Durante 30 s' ],
        ];

        await ctx.reply(`<pre>${table(quantityDurationTable, {
            header: {
                content: 'Água'
            },
            columns: [
                { alignment: 'right' },
                { alignment: 'right' },
            ]
        })}</pre>`, { parse_mode: 'HTML' });
    },
}
