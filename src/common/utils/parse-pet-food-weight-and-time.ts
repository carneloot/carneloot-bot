import { fromUnixTime, isAfter, set, subDays } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Either, Schema } from 'effect';

import Qty from 'js-quantities';

const MESSAGE_REGEX =
	/(?<quantity>\d+(?:\.\d+)?)(?<unit>mg|g|kg)?(?:\s+(?:(?<day>\d{1,2})-(?<month>\d{1,2})(?:-(?<year>\d{4}))?\s+)?(?<hour>\d{1,2}):(?<minute>\d{1,2}))?/i;

interface PetFoodWeightAndTime {
	messageMatch?: string;
	messageTime: number;
	timezone: string;
}

const RegexResultSchema = Schema.Struct({
	quantity: Schema.NumberFromString,
	unit: Schema.optionalWith(Schema.Literal('mg', 'g', 'kg'), {
		default: () => 'g'
	}),
	day: Schema.optional(Schema.NumberFromString),
	month: Schema.optional(Schema.NumberFromString),
	year: Schema.optional(Schema.NumberFromString),
	hour: Schema.optional(Schema.NumberFromString),
	minute: Schema.optional(Schema.NumberFromString)
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

	const safeParseResult = Schema.decodeUnknownEither(RegexResultSchema)(
		match.groups
	);

	if (Either.isLeft(safeParseResult)) {
		console.error(
			'Error parsing pet food weight and time',
			safeParseResult.left.message
		);
		return Either.left('A quantidade de ração informada é inválida.');
	}

	const groups = safeParseResult.right;

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
