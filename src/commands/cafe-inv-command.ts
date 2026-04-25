import type { Context } from 'grammy';
import Qty from 'js-quantities';
import { table } from 'table';

import type { Command } from '../common/types/command.js';

async function sendMissingInformationMessage(ctx: Context) {
	await ctx.reply('Me envie a quantidade de café em g. 😄');
}

const COFFEE_WATER_RATIO = Qty('60g/L');

export const CafeInvCommand: Command<'cafe_inv'> = {
	command: 'cafe_inv',
	description:
		'Calcula a quantidade de água necessária para fazer café com o filtro V60 de acordo com a quantidade de café.',
	middleware: () => async (ctx) => {
		if (!ctx.match) {
			await sendMissingInformationMessage(ctx);
			return;
		}

		const [, _coffeeAmount, _coffeeWaterRatio] =
			ctx.match.toString().match(/([0-9.,]+\w*)(?: +([0-9.,]+[\w/]*))?/) ?? [];

		const coffeeAmountInWeight = _coffeeAmount
			? _coffeeAmount.match(/^[0-9.,]+$/)
				? Qty(Number(_coffeeAmount.replaceAll(',', '.')), 'g')
				: Qty(_coffeeAmount)
			: null;

		if (!coffeeAmountInWeight || !coffeeAmountInWeight.isCompatible('g')) {
			await sendMissingInformationMessage(ctx);
			return;
		}

		if (Math.random() <= 0.5) {
			await ctx.reply('Lembre-se de molhar o filtro antes de colocar o café!');
		}

		const coffeeWaterRatio = _coffeeWaterRatio
			? _coffeeWaterRatio.match(/^[0-9.,]+$/)
				? Qty(Number(_coffeeWaterRatio.replaceAll(',', '.')), 'g/L')
				: Qty(_coffeeWaterRatio)
			: COFFEE_WATER_RATIO;

		if (!coffeeWaterRatio.isCompatible('g/L')) {
			await ctx.reply(
				'Proporção de café para quantidade água invalida. Por favor envie um valor na unidade g/L',
			);
			return;
		}

		// Calculate water amount: water = coffee / ratio
		const waterAmountInVolume = coffeeAmountInWeight.div(coffeeWaterRatio);
		const waterAmountInWeight = Qty(waterAmountInVolume.to('ml').scalar, 'g');

		const waterAmountToDisplay =
			waterAmountInVolume.scalar < 1
				? waterAmountInVolume.to('ml').toPrec('ml')
				: waterAmountInVolume.to('l').toPrec(0.01);

		await ctx.reply(`Quantidade de água: ${waterAmountToDisplay}`);

		const firstWaterPourMinInWeight = coffeeAmountInWeight.mul(2);
		const firstWaterPourMaxInWeight = coffeeAmountInWeight.mul(3);

		const firstPourMin = firstWaterPourMinInWeight.toPrec('g').toString();
		const firstPourMax = firstWaterPourMaxInWeight.toPrec('g').toString();

		const secondWaterPourQuantityInWeight = waterAmountInWeight.mul(0.6);

		const secondPour = secondWaterPourQuantityInWeight.toPrec('g').toString();
		const lastPour = waterAmountInWeight.toPrec('g').toString();

		const quantityDurationTable = [
			['Qtde.', 'Tempo'],
			[`${firstPourMin} a ${firstPourMax}`, 'Esperar 45 s'],
			[`Até ${secondPour}`, 'Durante 30 s'],
			[`Até ${lastPour}`, 'Durante 30 s'],
		];

		await ctx.reply(
			`<pre>${table(quantityDurationTable, {
				header: {
					content: 'Água',
				},
				columns: [{ alignment: 'right' }, { alignment: 'right' }],
			})}</pre>`,
			{ parse_mode: 'HTML' },
		);
	},
};
