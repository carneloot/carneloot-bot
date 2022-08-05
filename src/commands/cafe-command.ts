import { Context, MiddlewareFn } from 'grammy';

import Qty from 'js-quantities';

import { Command } from '../common/types/command';
import { sleep } from '../common/utils/sleep';
import ms from 'ms';

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

    if (!waterAmountInVolume.isCompatible('1L')) {
        await sendMissingInformationMessage(ctx);
        return;
    }

    if (Math.random() <= 0.5) {
        await ctx.reply(`Lembre-se de molhar o filtro antes de colocar o café!`);
    }

    const coffeeWeightInWeight = COFFEE_WATER_RATIO.mul(waterAmountInVolume);
    const waterAmountInWeight = Qty(waterAmountInVolume.scalar, 'g');

    await ctx.reply(`Quantidade de café: ${coffeeWeightInWeight.toPrec('g')}`);

    const firstWaterPourInWeight = coffeeWeightInWeight.mul(2);
    const secondWaterPourInWeight = waterAmountInWeight.mul(0.6).sub(firstWaterPourInWeight);
    const lastWaterPourInWeight = waterAmountInWeight.sub(secondWaterPourInWeight.add(firstWaterPourInWeight));

    await ctx.reply(`<pre>
    | Posição  |  Quantidade   | Tempo |
    |----------|-------------|------|
    | 1 | ${firstWaterPourInWeight.toPrec('g')}  | Espera 45 s  |
    | 2 | ${secondWaterPourInWeight.toPrec('g')} | Durante 30 s |
    | 3 | ${lastWaterPourInWeight.toPrec('g')}   | Durante 30 s |
    </pre>`, { parse_mode: 'HTML' });
}

CafeCommand.command = 'cafe';
CafeCommand.description = 'Calcula as proporções necessárias para fazer café com o filtro V60 de acordo com a quantidade inicial de água.';
