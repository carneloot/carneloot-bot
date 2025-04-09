import { Data, DateTime, Duration, Effect, Schema } from 'effect';

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

export class ParsePetFoodError extends Data.TaggedError('ParsePetFoodError')<{
	message: string;
}> {}

export const parsePetFoodWeightAndTime = Effect.fn('parsePetFoodWeightAndTime')(
	function* ({ messageMatch, messageTime, timezone }: PetFoodWeightAndTime) {
		if (!messageMatch) {
			return yield* new ParsePetFoodError({
				message: 'Por favor, envie uma mensagem'
			});
		}

		const match = messageMatch.match(MESSAGE_REGEX);

		if (!match) {
			return yield* new ParsePetFoodError({
				message:
					'Por favor, informe a quantidade de ração e o tempo decorrido desde a última refeição (o tempo é opcional).'
			});
		}

		const groups = yield* Schema.decodeUnknown(RegexResultSchema)(
			match.groups
		).pipe(
			Effect.catchTag('ParseError', () =>
				Effect.fail(
					new ParsePetFoodError({
						message: 'A quantidade de ração informada é inválida.'
					})
				)
			)
		);

		const quantity = Qty(groups.quantity, groups.unit).to('g');

		let time = yield* Effect.orDieWith(
			DateTime.makeZoned(messageTime * 1000, {
				timeZone: timezone
			}),
			() =>
				new Error(
					`Failed to create DateTime from message date with timezone ${timezone}`
				)
		);

		let timeChanged = false;
		if (groups.hour !== undefined && groups.minute !== undefined) {
			timeChanged = true;
			const newTime = DateTime.setParts(time, {
				day: groups.day,
				month: groups.month,
				year: groups.year,
				hours: groups.hour,
				minutes: groups.minute,
				seconds: 0,
				millis: 0
			});

			if (DateTime.greaterThan(newTime, time)) {
				time = DateTime.subtract(newTime, {
					days: DateTime.distanceDuration(newTime, time).pipe(Duration.toDays)
				});
			} else {
				time = newTime;
			}
		}

		return {
			quantity,
			timeChanged,
			time: DateTime.toDateUtc(time)
		};
	}
);
