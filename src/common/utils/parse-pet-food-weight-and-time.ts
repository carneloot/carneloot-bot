import { fromUnixTime, isAfter, set, subDays } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Either } from 'effect';

import Qty from 'js-quantities';

import { z } from 'zod';

const MESSAGE_REGEX =
	/(?<quantity>\d+(?:\.\d+)?)(?<unit>mg|g|kg)?(?:\s+(?:(?<day>\d{1,2})-(?<month>\d{1,2})(?:-(?<year>\d{4}))?\s+)?(?<hour>\d{1,2}):(?<minute>\d{1,2}))?/i;

interface PetFoodWeightAndTime {
	messageMatch?: string;
	messageTime: number;
	timezone: string;
}

const RegexResult = z.object({
	quantity: z.coerce.number(),
	unit: z.enum(['mg', 'g', 'kg']).default('g'),
	day: z.coerce.number().optional(),
	month: z.coerce.number().optional(),
	year: z.coerce.number().optional(),
	hour: z.coerce.number().optional(),
	minute: z.coerce.number().optional()
});

export const parsePetFoodWeightAndTime = ({
	messageMatch,
	messageTime,
	timezone
}: PetFoodWeightAndTime) => {
	if (!messageMatch) {
		return Either.left('Por favor, envie uma mensagem');
	}

	const match = messageMatch.match(MESSAGE_REGEX);

	if (!match) {
		return Either.left(
			'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
		);
	}

	const safeParseResult = RegexResult.safeParse(match.groups);

	if (!safeParseResult.success) {
		return Either.left('A quantidade de ração informada é inválida.');
	}

	const groups = safeParseResult.data;

	const quantity = Qty(groups.quantity, groups.unit).to('g');

	let time = fromUnixTime(messageTime);
	let timeChanged = false;
	if (groups.hour !== undefined && groups.minute !== undefined) {
		timeChanged = true;
		const newTime = zonedTimeToUtc(
			set(utcToZonedTime(time, timezone), {
				date: groups.day,
				month: groups.month ? groups.month - 1 : undefined,
				year: groups.year,
				hours: groups.hour,
				minutes: groups.minute,
				seconds: 0,
				milliseconds: 0
			}),
			timezone
		);

		if (isAfter(newTime, time)) {
			time = subDays(newTime, newTime.getDate() - time.getDate());
		} else {
			time = newTime;
		}
	}

	return Either.right({
		quantity,
		timeChanged,
		time
	});
};
