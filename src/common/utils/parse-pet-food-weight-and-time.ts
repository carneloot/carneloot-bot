import { addMilliseconds, fromUnixTime, subMilliseconds } from 'date-fns';
import { err, ok } from 'neverthrow';

import { Context } from '../types/context.js';

import Qty from 'js-quantities';
import ms from 'ms';

export const WEIGHT_REGEX = /(\d+(?:\.\d+)?)(mg|g|kg)?\b/i;

export const parsePetFoodWeightAndTime = (messageMatch: Context['match'], messageTime: number) => {
	if (!messageMatch || Array.isArray(messageMatch)) {
		return err(
			'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
		);
	}

	const [quantityRaw, deltaTimeRaw] = messageMatch.split(' ');

	const quantityMatch = quantityRaw.match(WEIGHT_REGEX);
	if (!quantityMatch) {
		return err('A quantidade de ração informada é inválida.');
	}

	const quantity = Qty(Number(quantityMatch[1]), quantityMatch[2] ?? 'g').to('g');

	let time = fromUnixTime(messageTime);
	if (deltaTimeRaw) {
		const isNegative = deltaTimeRaw.startsWith('-');
		const deltaTime = ms(deltaTimeRaw.replace(/^-/, ''));
		if (isNegative) {
			time = subMilliseconds(time, deltaTime);
		} else {
			time = addMilliseconds(time, deltaTime);
		}
	}

	return ok({
		quantity,
		time
	});
};
