import { zonedTimeToUtc } from 'date-fns-tz';
import { fromUnixTime, set } from 'date-fns';
import { err, ok } from 'neverthrow';

import Qty from 'js-quantities';

import { Context } from '../types/context.js';

export const WEIGHT_REGEX = /(\d+(?:\.\d+)?)(mg|g|kg)?\b/i;
export const DATE_TIME_REGEX =
	/(?:(?<day>\d{1,2})-(?<month>\d{1,2})(?<year>-\d{4})?\s+)?(?<hour>\d{1,2}):(?<minute>\d{1,2})/;

interface PetFoodWeightAndTime {
	messageMatch: Context['match'];
	messageTime: number;
	timezone: string;
}

export const parsePetFoodWeightAndTime = ({
	messageMatch,
	messageTime,
	timezone
}: PetFoodWeightAndTime) => {
	if (!messageMatch || Array.isArray(messageMatch)) {
		return err(
			'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
		);
	}

	const [quantityRaw, timeRaw] = messageMatch.split(' ');

	const quantityMatch = quantityRaw.match(WEIGHT_REGEX);
	if (!quantityMatch) {
		return err('A quantidade de ração informada é inválida.');
	}

	const quantity = Qty(Number(quantityMatch[1]), quantityMatch[2] ?? 'g').to('g');

	let time = fromUnixTime(messageTime);
	if (timeRaw) {
		const timeMatch = timeRaw.match(DATE_TIME_REGEX);

		if (!timeMatch) {
			return err(
				'Por favor, mande o tempo da última refeição no formato "dd-mm-yyyy hh:mm" (a data é opcional).'
			);
		}

		time = zonedTimeToUtc(
			set(time, {
				date: timeMatch.groups!.day ? parseInt(timeMatch.groups!.day, 10) : undefined,
				month: timeMatch.groups!.month ? parseInt(timeMatch.groups!.month, 10) : undefined,
				year: timeMatch.groups!.year ? parseInt(timeMatch.groups!.year, 10) : undefined,
				hours: parseInt(timeMatch.groups!.hour, 10),
				minutes: parseInt(timeMatch.groups!.minute, 10),
				seconds: 0,
				milliseconds: 0
			}),
			timezone
		);
	}

	return ok({
		quantity,
		time
	});
};
