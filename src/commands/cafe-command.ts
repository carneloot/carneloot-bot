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

    await ctx.reply(`Você vai precisar usar ${coffeeWeightInWeight.toPrec('g')} de café!`);
    await ctx.reply(`Coloca o café no filtro e faz um buraquinho no meio hehe`);

    const firstWaterPourInWeight = coffeeWeightInWeight.mul(2);

    await ctx.reply(`Na primeira vez coloque ${firstWaterPourInWeight.toPrec('g')} de água.`);
    await ctx.reply(`Depois disso dá uma mexida no filtro com o café para misturar bem 🤤`);

    await sleep(ms('7s'));

    await ctx.reply(`Espera uns 45 segundos (não se preocupa, eu te aviso!)`);

    await sleep(ms('45s'));

    const secondWaterPourInWeight = waterAmountInWeight.mul(0.6);

    await ctx.reply(`Pronto!`);
    await ctx.reply(`Agora coloque ${secondWaterPourInWeight.toPrec('g')} de água nos próximos 30 segundos.`);

    await sleep(ms('5s'));

    await ctx.reply('Vai lá!');

    await sleep(ms('15s'));

    await ctx.reply('Já foi metade! Só mais 15 segundos 👌');

    await sleep(ms('15s'));

    const lastWaterPourInWeight = waterAmountInWeight.sub(firstWaterPourInWeight.add(secondWaterPourInWeight));

    await ctx.reply(`Por fim coloque o restante da água (${lastWaterPourInWeight.toPrec('g')}) nos próximos 30 segundos.`);

    await sleep(ms('7s'));

    await ctx.reply('Vai lá!');

    await sleep(ms('15s'));

    await ctx.reply('15 segundos e contando...');

    await sleep(ms('15s'));

    await ctx.reply('Prontinho 😄');
    await ctx.reply('Agora usando uma colher mexe para um lado e depois para o outro.\nIsso ajuda a tirar o café da parede do filtro!');

    await sleep(ms('1s'));

    await ctx.reply('Quando estiver mais de boas, dá uma mexida de novo no filtro com o café!');

    await sleep(ms('10s'));

    await ctx.reply('Depois de acabar, só aproveitar o cafézinho 🤤');
}

CafeCommand.command = 'cafe';
CafeCommand.description = 'Calcula as proporções necessárias para fazer café com o filtro V60 de acordo com a quantidade inicial de água.';
